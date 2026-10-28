import { Router } from "express";
import { eq, desc, and } from "drizzle-orm";
import { db } from "../db/index.js";
import { tasks, taskReminders, reminderLogs } from "../db/schema.js";
import {
  maskPhoneNumber,
  validatePhoneNumber,
  validateTimezone,
  validateReminderTime,
  formatReminderMessage,
  sendSms,
  isSmsConfigured,
  getSmsConfigStatus,
} from "../services/sms.js";

const router = Router();

/**
 * GET /api/tasks/sms-config — retrieve SMS provider status and trial template settings
 */
router.get("/sms-config", (req, res) => {
  try {
    const config = getSmsConfigStatus();
    return res.status(200).json({
      success: true,
      data: config,
    });
  } catch (err) {
    return res.status(500).json({
      success: false,
      message: "Failed to retrieve SMS configuration status",
      error: err.message,
    });
  }
});

// In-memory rate limiting map for test SMS: taskId -> lastSentTimestamp
const testSmsRateLimitMap = new Map();

/**
 * Validate and parse integer ID parameter
 */
const parseId = (idStr) => {
  const parsed = parseInt(idStr, 10);
  if (isNaN(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
};

/**
 * GET /api/tasks/:id/reminder — retrieve reminder settings
 */
router.get("/:id/reminder", async (req, res) => {
  try {
    const taskId = parseId(req.params.id);
    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID. ID must be a positive integer.",
      });
    }

    const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!taskResult || taskResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${taskId} not found.`,
      });
    }

    const reminderResult = await db
      .select()
      .from(taskReminders)
      .where(eq(taskReminders.taskId, taskId));

    if (!reminderResult || reminderResult.length === 0) {
      // Default initial settings
      return res.status(200).json({
        success: true,
        data: {
          taskId,
          enabled: false,
          phoneNumber: "",
          phoneNumberMasked: "",
          reminderTime: "09:00",
          timezone: process.env.APP_TIMEZONE || "Asia/Kolkata",
          consentGiven: false,
          createdAt: null,
          updatedAt: null,
        },
      });
    }

    const reminder = reminderResult[0];
    return res.status(200).json({
      success: true,
      data: {
        ...reminder,
        phoneNumberMasked: maskPhoneNumber(reminder.phoneNumber),
      },
    });
  } catch (error) {
    console.error("Error retrieving reminder settings:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching reminder settings",
      error: error.message,
    });
  }
});

/**
 * PUT /api/tasks/:id/reminder — save or update reminder settings
 */
router.put("/:id/reminder", async (req, res) => {
  try {
    const taskId = parseId(req.params.id);
    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID. ID must be a positive integer.",
      });
    }

    const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!taskResult || taskResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${taskId} not found.`,
      });
    }

    const { enabled, phoneNumber, reminderTime, timezone, consentGiven } = req.body;
    const isEnabled = Boolean(enabled);
    const hasConsent = Boolean(consentGiven);

    let cleanPhone = null;
    let cleanTime = reminderTime ? String(reminderTime).trim() : "09:00";
    let cleanTz = timezone ? String(timezone).trim() : process.env.APP_TIMEZONE || "Asia/Kolkata";

    // Strict validation if enabled
    if (isEnabled) {
      if (!hasConsent) {
        return res.status(400).json({
          success: false,
          message: "User consent is required before enabling daily SMS reminders.",
        });
      }

      const phoneValidation = validatePhoneNumber(phoneNumber);
      if (!phoneValidation.valid) {
        return res.status(400).json({
          success: false,
          message: phoneValidation.message,
        });
      }
      cleanPhone = phoneValidation.phone;

      if (!validateReminderTime(cleanTime)) {
        return res.status(400).json({
          success: false,
          message: "Invalid reminder time format. Use HH:mm in 24-hour format (e.g. 09:00, 18:30).",
        });
      }

      if (!validateTimezone(cleanTz)) {
        return res.status(400).json({
          success: false,
          message: `Invalid timezone "${cleanTz}". Please provide a valid IANA timezone (e.g. Asia/Kolkata).`,
        });
      }
    } else {
      // If disabled, phone can still be saved if valid
      if (phoneNumber && typeof phoneNumber === "string" && phoneNumber.trim()) {
        const phoneValidation = validatePhoneNumber(phoneNumber);
        if (phoneValidation.valid) {
          cleanPhone = phoneValidation.phone;
        } else {
          cleanPhone = phoneNumber.trim();
        }
      }
    }

    const existingReminders = await db
      .select()
      .from(taskReminders)
      .where(eq(taskReminders.taskId, taskId));

    if (existingReminders.length > 0) {
      await db
        .update(taskReminders)
        .set({
          enabled: isEnabled,
          phoneNumber: cleanPhone,
          reminderTime: cleanTime,
          timezone: cleanTz,
          consentGiven: hasConsent,
        })
        .where(eq(taskReminders.taskId, taskId));
    } else {
      await db.insert(taskReminders).values({
        taskId,
        enabled: isEnabled,
        phoneNumber: cleanPhone,
        reminderTime: cleanTime,
        timezone: cleanTz,
        consentGiven: hasConsent,
      });
    }

    const [savedReminder] = await db
      .select()
      .from(taskReminders)
      .where(eq(taskReminders.taskId, taskId));

    return res.status(200).json({
      success: true,
      message: isEnabled ? "Reminder settings saved and enabled." : "Reminder settings saved (disabled).",
      data: {
        ...savedReminder,
        phoneNumberMasked: maskPhoneNumber(savedReminder.phoneNumber),
      },
    });
  } catch (error) {
    console.error("Error saving reminder settings:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while saving reminder settings",
      error: error.message,
    });
  }
});

/**
 * GET /api/tasks/:id/reminder-history — retrieve delivery history
 */
router.get("/:id/reminder-history", async (req, res) => {
  try {
    const taskId = parseId(req.params.id);
    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID. ID must be a positive integer.",
      });
    }

    const taskResult = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!taskResult || taskResult.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${taskId} not found.`,
      });
    }

    const historyLogs = await db
      .select()
      .from(reminderLogs)
      .where(eq(reminderLogs.taskId, taskId))
      .orderBy(desc(reminderLogs.createdAt))
      .limit(50);

    const sanitizedLogs = historyLogs.map((log) => ({
      id: log.id,
      scheduledDate: log.scheduledDate,
      scheduledTime: log.scheduledTime,
      status: log.status,
      attemptedAt: log.attemptedAt,
      deliveredAt: log.deliveredAt,
      providerMessageId: log.providerMessageId,
      errorMessage: log.errorMessage,
      isTest: Boolean(log.isTest),
      recipientPhoneMasked: maskPhoneNumber(log.recipientPhone),
      createdAt: log.createdAt,
    }));

    return res.status(200).json({
      success: true,
      count: sanitizedLogs.length,
      data: sanitizedLogs,
    });
  } catch (error) {
    console.error("Error retrieving reminder history:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching reminder history",
      error: error.message,
    });
  }
});

/**
 * POST /api/tasks/:id/reminder/test — Send immediate test SMS
 */
router.post("/:id/reminder/test", async (req, res) => {
  try {
    const taskId = parseId(req.params.id);
    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID. ID must be a positive integer.",
      });
    }

    const [task] = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!task) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${taskId} not found.`,
      });
    }

    // Rate limiting: at most 1 test per 30 seconds per task
    const lastAttempt = testSmsRateLimitMap.get(taskId);
    const now = Date.now();
    if (lastAttempt && now - lastAttempt < 30000) {
      const waitSeconds = Math.ceil((30000 - (now - lastAttempt)) / 1000);
      return res.status(429).json({
        success: false,
        message: `Rate limit: Please wait ${waitSeconds} seconds before sending another test SMS.`,
      });
    }

    const [reminder] = await db.select().from(taskReminders).where(eq(taskReminders.taskId, taskId));
    const targetPhone = req.body?.phoneNumber || reminder?.phoneNumber;

    const phoneValidation = validatePhoneNumber(targetPhone);
    if (!phoneValidation.valid) {
      return res.status(400).json({
        success: false,
        message: `Invalid recipient phone number: ${phoneValidation.message}`,
      });
    }

    // Update rate limit timestamp
    testSmsRateLimitMap.set(taskId, now);

    const testMessage = `[TEST] ${formatReminderMessage(task.title)}`;
    const maskedPhone = maskPhoneNumber(phoneValidation.phone);

    // Insert test record in reminder_logs with isTest: true and dedupKey: null
    const [insertResult] = await db.insert(reminderLogs).values({
      taskId,
      recipientPhone: phoneValidation.phone,
      scheduledDate: new Date().toISOString().slice(0, 10),
      scheduledTime: new Date().toTimeString().slice(0, 5),
      status: "processing",
      processingStartedAt: new Date(),
      attemptedAt: new Date(),
      errorMessage: null,
      isTest: true,
      dedupKey: null, // Test messages never occupy or collide with daily dedup key!
    });

    const logId = insertResult.insertId;

    // Dispatch SMS
    const smsResult = await sendSms({
      to: phoneValidation.phone,
      message: testMessage,
      taskId,
      isTest: true,
    });

    // Update log
    await db
      .update(reminderLogs)
      .set({
        status: smsResult.status,
        providerMessageId: smsResult.providerMessageId,
        errorMessage: smsResult.errorMessage,
        deliveredAt: smsResult.status === "delivered" ? new Date() : null,
      })
      .where(eq(reminderLogs.id, logId));

    if (smsResult.success) {
      const successMessage = smsResult.isGenericTemplate
        ? `Test SMS dispatched using Twilio trial template '${smsResult.templateName}' to ${maskedPhone}. Note: Twilio trial templates are generic and do not contain custom task titles.`
        : `Test SMS dispatched successfully to ${maskedPhone}. Provider Status: ${smsResult.status}.`;

      return res.status(200).json({
        success: true,
        message: successMessage,
        providerMessageId: smsResult.providerMessageId,
        status: smsResult.status,
        isGenericTemplate: Boolean(smsResult.isGenericTemplate),
        templateName: smsResult.templateName || null,
      });
    } else {
      return res.status(400).json({
        success: false,
        message: `Test SMS could not be sent: ${smsResult.errorMessage}`,
        providerMessageId: smsResult.providerMessageId,
        status: smsResult.status,
        errorCode: smsResult.errorCode || null,
        isTrialMode: Boolean(smsResult.isTrialMode),
      });
    }
  } catch (error) {
    console.error("Error sending test SMS:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while sending test SMS",
      error: error.message,
    });
  }
});

export default router;
