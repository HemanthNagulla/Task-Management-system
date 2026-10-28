import cron from "node-cron";
import { DateTime } from "luxon";
import { eq, and, sql } from "drizzle-orm";
import { db, poolConnection } from "../db/index.js";
import { tasks, taskReminders, reminderLogs } from "../db/schema.js";
import {
  sendSms,
  formatReminderMessage,
  maskPhoneNumber,
  validatePhoneNumber,
  validateTimezone,
  validateReminderTime,
} from "./sms.js";

let isSchedulerRunning = false;
let cronTask = null;

/**
 * Process a single task reminder with DB-level lock and duplicate prevention
 */
async function processTaskReminder(reminder, task) {
  const taskId = reminder.taskId;
  const timezone = validateTimezone(reminder.timezone) ? reminder.timezone : "Asia/Kolkata";
  const nowInZone = DateTime.now().setZone(timezone);

  if (!nowInZone.isValid) {
    console.warn(`[Scheduler] Invalid timezone "${reminder.timezone}" for task ${taskId}. Skipping.`);
    return;
  }

  const localDateStr = nowInZone.toFormat("yyyy-MM-dd");
  const localTimeStr = nowInZone.toFormat("HH:mm");
  const scheduledTime = reminder.reminderTime || "09:00";

  // Check if current time has reached the scheduled reminder time for today
  if (localTimeStr < scheduledTime) {
    // Not due yet today
    return;
  }

  const dedupKey = `${taskId}_${localDateStr}`;

  // 1. Atomic DB claim using unique constraint on dedupKey
  const connection = await poolConnection.getConnection();
  let logId = null;

  try {
    try {
      const [insertResult] = await connection.query(
        `INSERT INTO reminder_logs 
         (taskId, recipientPhone, scheduledDate, scheduledTime, status, processingStartedAt, attemptedAt, dedupKey, isTest)
         VALUES (?, ?, ?, ?, 'processing', NOW(), NOW(), ?, false)`,
        [taskId, reminder.phoneNumber, localDateStr, scheduledTime, dedupKey]
      );
      logId = insertResult.insertId;
    } catch (dbError) {
      // ER_DUP_ENTRY: already attempted or claimed for today
      if (dbError.code === "ER_DUP_ENTRY" || dbError.errno === 1062) {
        // Check if there is an abandoned processing claim (> 10 minutes old)
        const [existingLogs] = await connection.query(
          `SELECT id, status, processingStartedAt FROM reminder_logs WHERE dedupKey = ? LIMIT 1`,
          [dedupKey]
        );

        if (existingLogs.length > 0 && existingLogs[0].status === "processing") {
          const startedAt = DateTime.fromJSDate(existingLogs[0].processingStartedAt);
          const ageMinutes = DateTime.now().diff(startedAt, "minutes").minutes;

          if (ageMinutes > 10) {
            console.log(`[Scheduler] Recovering stale claim for task ${taskId} (log #${existingLogs[0].id}, age: ${Math.round(ageMinutes)}m)`);
            logId = existingLogs[0].id;
            await connection.query(
              `UPDATE reminder_logs SET processingStartedAt = NOW(), attemptedAt = NOW() WHERE id = ?`,
              [logId]
            );
          } else {
            // Already processing within normal window
            return;
          }
        } else {
          // Already sent, delivered, or failed today
          return;
        }
      } else {
        throw dbError;
      }
    }
  } finally {
    connection.release();
  }

  if (!logId) return;

  // 2. Pre-send re-checks: Ensure task is still Pending and reminder is still enabled
  const currentTaskRows = await db.select().from(tasks).where(eq(tasks.id, taskId));
  const currentTask = currentTaskRows[0];

  const currentReminderRows = await db.select().from(taskReminders).where(eq(taskReminders.taskId, taskId));
  const currentReminder = currentReminderRows[0];

  if (!currentTask || currentTask.status !== "Pending" || !currentReminder || !currentReminder.enabled) {
    console.log(`[Scheduler] Task ${taskId} is no longer Pending or reminder was disabled. Cancelling dispatch.`);
    await db
      .update(reminderLogs)
      .set({
        status: "failed",
        errorMessage: "Cancelled: Task is no longer Pending or reminder was disabled prior to dispatch.",
      })
      .where(eq(reminderLogs.id, logId));
    return;
  }

  // 3. Dispatch SMS outside of any database transaction
  const maskedPhone = maskPhoneNumber(reminder.phoneNumber);
  console.log(`[Scheduler] Dispatching due reminder for task "${currentTask.title}" (ID: ${taskId}) to ${maskedPhone}...`);

  const messageText = formatReminderMessage(currentTask.title);
  let smsResult;

  try {
    smsResult = await sendSms({
      to: reminder.phoneNumber,
      message: messageText,
      taskId: taskId,
      isTest: false,
    });
  } catch (err) {
    console.error(`[Scheduler] Unexpected provider exception for task ${taskId}:`, err.message);
    smsResult = {
      success: false,
      status: "unknown", // Uncertain outcome: don't blindly resend today
      providerMessageId: null,
      errorMessage: `Provider communication error: ${err.message}`,
    };
  }

  // 4. Update the reminder log with the outcome
  try {
    await db
      .update(reminderLogs)
      .set({
        status: smsResult.status,
        providerMessageId: smsResult.providerMessageId,
        errorMessage: smsResult.errorMessage,
        deliveredAt: smsResult.status === "delivered" ? new Date() : null,
      })
      .where(eq(reminderLogs.id, logId));

    console.log(`[Scheduler] Reminder for task ${taskId} logged with status: ${smsResult.status}`);
  } catch (updateErr) {
    console.error(`[Scheduler] Failed to update reminder_logs for log ${logId}:`, updateErr.message);
  }
}

/**
 * Execute due reminder scan across all enabled reminders
 */
export async function checkDueReminders() {
  if (isSchedulerRunning) {
    return;
  }

  isSchedulerRunning = true;
  try {
    // Find all enabled reminders for tasks with status = 'Pending'
    const dueCandidates = await db
      .select({
        reminder: taskReminders,
        task: tasks,
      })
      .from(taskReminders)
      .innerJoin(tasks, eq(taskReminders.taskId, tasks.id))
      .where(
        and(
          eq(taskReminders.enabled, true),
          eq(taskReminders.consentGiven, true),
          eq(tasks.status, "Pending")
        )
      );

    if (dueCandidates.length > 0) {
      for (const item of dueCandidates) {
        try {
          await processTaskReminder(item.reminder, item.task);
        } catch (itemErr) {
          console.error(`[Scheduler] Error evaluating reminder for task ${item.task.id}:`, itemErr.message);
        }
      }
    }
  } catch (error) {
    console.error("[Scheduler] Error in checkDueReminders loop:", error.message);
  } finally {
    isSchedulerRunning = false;
  }
}

/**
 * Initialize and start the cron scheduler
 */
export function startReminderScheduler() {
  if (cronTask) {
    console.log("ℹ️ SMS Scheduler already running.");
    return;
  }

  // Run every minute: '* * * * *'
  cronTask = cron.schedule("* * * * *", async () => {
    await checkDueReminders();
  });

  console.log("✓ TaskMaster Daily SMS Reminder Scheduler started (cron: * * * * *).");

  // Run an immediate check on startup
  setTimeout(() => {
    checkDueReminders().catch((err) => {
      console.error("[Scheduler] Error during startup reminder check:", err.message);
    });
  }, 3000);
}

/**
 * Stop scheduler gracefully (for graceful shutdown or tests)
 */
export function stopReminderScheduler() {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    console.log("TaskMaster Daily SMS Reminder Scheduler stopped.");
  }
}
