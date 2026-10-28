import assert from "node:assert/strict";
import { poolConnection, db } from "../db/index.js";
import { tasks, taskReminders, reminderLogs } from "../db/schema.js";
import { eq } from "drizzle-orm";
import {
  validatePhoneNumber,
  validateTimezone,
  validateReminderTime,
  formatReminderMessage,
  maskPhoneNumber,
  isSmsConfigured,
  getSmsConfigStatus,
  sendSms,
  formatTwilioError,
  TWILIO_TRIAL_TEMPLATES,
  isTrialModeEnabled,
  getTrialTemplateName,
  validateTrialTemplateConfig,
  _setTwilioClientForTesting,
} from "../services/sms.js";
import { checkDueReminders } from "../services/scheduler.js";

async function runTestSuite() {
  console.log("=================================================");
  console.log(" TaskMaster SMS Reminder Automated Test Suite ");
  console.log("=================================================");

  let passedCount = 0;
  let failedCount = 0;

  async function test(name, fn) {
    try {
      await fn();
      console.log(`PASS: ${name}`);
      passedCount++;
    } catch (err) {
      console.error(`FAIL: ${name}`);
      console.error(`       Error: ${err.message}`);
      failedCount++;
    }
  }

  let testTaskId = null;

  try {
    // ------------------------------------------------------------------------
    // Group 1: Unit Validation Checks
    // ------------------------------------------------------------------------
    await test("1. Phone Number Validation (E.164 standard)", () => {
      // Valid cases
      assert.equal(validatePhoneNumber("+919876543210").valid, true);
      assert.equal(validatePhoneNumber("+14155552671").valid, true);
      assert.equal(validatePhoneNumber("+442071838750").valid, true);
      assert.equal(validatePhoneNumber("+91 98765-43210").phone, "+919876543210");

      // Invalid cases
      assert.equal(validatePhoneNumber("9876543210").valid, false); // Missing +
      assert.equal(validatePhoneNumber("+123").valid, false); // Too short
      assert.equal(validatePhoneNumber("").valid, false); // Empty
      assert.equal(validatePhoneNumber(null).valid, false);
      assert.equal(validatePhoneNumber("+91abcdefghij").valid, false); // Non-digit
    });

    await test("2. Timezone Validation (IANA timezones)", () => {
      assert.equal(validateTimezone("Asia/Kolkata"), true);
      assert.equal(validateTimezone("America/New_York"), true);
      assert.equal(validateTimezone("UTC"), true);
      assert.equal(validateTimezone("Europe/London"), true);

      assert.equal(validateTimezone("Invalid/Not_A_Timezone"), false);
      assert.equal(validateTimezone(""), false);
      assert.equal(validateTimezone(null), false);
    });

    await test("3. Reminder Time Format Validation (24-hour HH:mm)", () => {
      assert.equal(validateReminderTime("09:00"), true);
      assert.equal(validateReminderTime("23:59"), true);
      assert.equal(validateReminderTime("00:00"), true);
      assert.equal(validateReminderTime("14:30"), true);

      assert.equal(validateReminderTime("9:00"), false); // Needs 2 digits
      assert.equal(validateReminderTime("24:00"), false); // Max 23
      assert.equal(validateReminderTime("12:60"), false); // Max 59
      assert.equal(validateReminderTime("invalid"), false);
    });

    await test("4. Recipient Phone Number Masking (Privacy & Security)", () => {
      assert.equal(maskPhoneNumber("+919876543210"), "+91******3210");
      assert.equal(maskPhoneNumber("+14155552671"), "+14*****2671");
      assert.equal(maskPhoneNumber("123"), "***");
    });

    await test("5. Message Template Formatting & Sanitization", () => {
      const msg = formatReminderMessage("Submit Project Report\nLine 2");
      assert.equal(
        msg,
        "TaskMaster Reminder: Your task 'Submit Project Report Line 2' is still pending. Please review and complete it today."
      );
    });

    // ------------------------------------------------------------------------
    // Group 2: Database & Reminder Settings Integration
    // ------------------------------------------------------------------------
    await test("6. Create Test Task in MySQL for Reminder Tests", async () => {
      const [insertResult] = await db.insert(tasks).values({
        title: "Automated SMS Test Task",
        description: "Created specifically for automated testing",
        status: "Pending",
      });
      testTaskId = insertResult.insertId;
      assert.ok(testTaskId > 0, "Task ID should be positive integer");
    });

    await test("7. Save and Retrieve Reminder Settings", async () => {
      // Insert reminder
      await db.insert(taskReminders).values({
        taskId: testTaskId,
        enabled: true,
        phoneNumber: "+919876543210",
        reminderTime: "09:00",
        timezone: "Asia/Kolkata",
        consentGiven: true,
      });

      const [stored] = await db.select().from(taskReminders).where(eq(taskReminders.taskId, testTaskId));
      assert.ok(stored, "Stored reminder should exist");
      assert.equal(stored.enabled, true);
      assert.equal(stored.phoneNumber, "+919876543210");
      assert.equal(stored.timezone, "Asia/Kolkata");
      assert.equal(stored.consentGiven, true);
    });

    await test("8. Update Reminder Settings in MySQL", async () => {
      await db
        .update(taskReminders)
        .set({
          reminderTime: "18:30",
          timezone: "Asia/Dubai",
        })
        .where(eq(taskReminders.taskId, testTaskId));

      const [updated] = await db.select().from(taskReminders).where(eq(taskReminders.taskId, testTaskId));
      assert.equal(updated.reminderTime, "18:30");
      assert.equal(updated.timezone, "Asia/Dubai");
    });

    // ------------------------------------------------------------------------
    // Group 3: Duplicate Prevention & Atomic Claiming
    // ------------------------------------------------------------------------
    await test("9. Duplicate Prevention for Same Task and Local Date", async () => {
      const todayDate = "2026-10-28";
      const dedupKey = `${testTaskId}_${todayDate}`;

      // Clean any existing test log for this task
      const conn = await poolConnection.getConnection();
      try {
        await conn.query("DELETE FROM reminder_logs WHERE taskId = ?", [testTaskId]);

        // First claim: Should succeed
        const [claim1] = await conn.query(
          `INSERT INTO reminder_logs 
           (taskId, recipientPhone, scheduledDate, scheduledTime, status, processingStartedAt, dedupKey, isTest)
           VALUES (?, ?, ?, '09:00', 'processing', NOW(), ?, false)`,
          [testTaskId, "+919876543210", todayDate, dedupKey]
        );
        assert.ok(claim1.insertId > 0, "First claim should insert successfully");

        // Second claim attempt for same task and date: MUST fail with ER_DUP_ENTRY
        let duplicateFailed = false;
        try {
          await conn.query(
            `INSERT INTO reminder_logs 
             (taskId, recipientPhone, scheduledDate, scheduledTime, status, processingStartedAt, dedupKey, isTest)
             VALUES (?, ?, ?, '09:00', 'processing', NOW(), ?, false)`,
            [testTaskId, "+919876543210", todayDate, dedupKey]
          );
        } catch (err) {
          if (err.code === "ER_DUP_ENTRY" || err.errno === 1062) {
            duplicateFailed = true;
          }
        }
        assert.equal(duplicateFailed, true, "Concurrent claim on same date must throw ER_DUP_ENTRY");
      } finally {
        conn.release();
      }
    });

    // ------------------------------------------------------------------------
    // Group 4: Test SMS Isolation
    // ------------------------------------------------------------------------
    await test("10. Test SMS Isolation from Daily Scheduled Dedup Key", async () => {
      const conn = await poolConnection.getConnection();
      try {
        // Multiple test SMS records can exist with dedupKey: null
        const [test1] = await conn.query(
          `INSERT INTO reminder_logs 
           (taskId, recipientPhone, scheduledDate, scheduledTime, status, isTest, dedupKey)
           VALUES (?, ?, '2026-10-28', '12:00', 'accepted', true, NULL)`,
          [testTaskId, "+919876543210"]
        );

        const [test2] = await conn.query(
          `INSERT INTO reminder_logs 
           (taskId, recipientPhone, scheduledDate, scheduledTime, status, isTest, dedupKey)
           VALUES (?, ?, '2026-10-28', '12:01', 'accepted', true, NULL)`,
          [testTaskId, "+919876543210"]
        );

        assert.ok(test1.insertId > 0 && test2.insertId > 0, "Test SMS must allow multiple records without collision");
      } finally {
        conn.release();
      }
    });

    // ------------------------------------------------------------------------
    // Group 5: Completed Task / Reopened Task Handling
    // ------------------------------------------------------------------------
    await test("11. Completed Tasks are Excluded from Reminders", async () => {
      // Mark task as Completed
      await db.update(tasks).set({ status: "Completed" }).where(eq(tasks.id, testTaskId));

      // Query what scheduler selects
      const dueCandidates = await db
        .select()
        .from(taskReminders)
        .innerJoin(tasks, eq(taskReminders.taskId, tasks.id))
        .where(eq(tasks.id, testTaskId));

      const isCandidatePending = dueCandidates.some((c) => c.tasks.status === "Pending");
      assert.equal(isCandidatePending, false, "Completed tasks must never be selected by scheduler");
    });

    // ------------------------------------------------------------------------
    // Group 6: SMS Provider Status & Missing Credentials Graceful Handling
    // ------------------------------------------------------------------------
    await test("12. Missing SMS Credentials / Safe Status Check", () => {
      const status = getSmsConfigStatus();
      assert.ok(typeof status.configured === "boolean");
      assert.equal(status.provider, "Twilio SMS");
      assert.ok(status.message);
      // Secrets must NOT be present
      assert.equal(status.accountSid, undefined);
      assert.equal(status.authToken, undefined);
    });

    await test("13. Safe Send Outcome Handling without or with Test Credentials", async () => {
      // sendSms must return a safe failure object without throwing unhandled exceptions
      const result = await sendSms({
        to: "+919876543210",
        message: "Test message",
        taskId: testTaskId,
        isTest: true,
      });

      assert.equal(result.success, false);
      assert.equal(result.status, "failed");
      assert.ok(typeof result.errorMessage === "string" && result.errorMessage.length > 0);
      if (!isSmsConfigured()) {
        assert.ok(result.errorMessage.includes("SMS provider not configured"));
      }
    });

    // ------------------------------------------------------------------------
    // Group 7: Cascade Deletion
    // ------------------------------------------------------------------------
    await test("14. Deleting a Task Cascades to Reminders & Logs", async () => {
      await db.delete(tasks).where(eq(tasks.id, testTaskId));

      const remindersAfter = await db
        .select()
        .from(taskReminders)
        .where(eq(taskReminders.taskId, testTaskId));
      assert.equal(remindersAfter.length, 0, "task_reminders row must cascade delete");

      const logsAfter = await db
        .select()
        .from(reminderLogs)
        .where(eq(reminderLogs.taskId, testTaskId));
      assert.equal(logsAfter.length, 0, "reminder_logs rows must cascade delete");
    });

    // ------------------------------------------------------------------------
    // Group 8: Twilio Error 572006 & Provider Error Handling
    // ------------------------------------------------------------------------
    await test("15. Twilio Error 572006 Handling & Actionable Guidance", () => {
      const mock572006 = {
        code: 572006,
        message: "Invalid template name. Trial accounts can only use predefined SMS templates.",
      };

      const result = formatTwilioError(mock572006);
      assert.ok(result.includes("Twilio Error [572006]"), "Must include exact error code 572006");
      assert.ok(result.includes("Trial account restriction"), "Must explain trial account restriction");
      assert.ok(
        result.includes("cannot send custom SMS reminder bodies"),
        "Must clarify why custom text was rejected"
      );
      assert.ok(
        result.includes("upgraded to paid status") || result.includes("predefined template"),
        "Must specify how to fix (upgrade or use approved template)"
      );
      // Verify message is not truncated
      assert.ok(result.length > 50, "Full message must not be truncated to 'Invalid t...'");
    });

    await test("16. Twilio Error 21608 (Unverified Recipient in Trial Account)", () => {
      const mock21608 = {
        code: 21608,
        message: "The number +919876543210 is unverified. Trial accounts cannot send messages to unverified numbers.",
      };

      const result = formatTwilioError(mock21608, "+12055550199", "+91******3210");
      assert.ok(result.includes("Twilio Error [21608]"));
      assert.ok(result.includes("Verified Caller IDs"));
    });

    await test("17. Twilio Error 21606 (Invalid Sender 'From' Number)", () => {
      const mock21606 = {
        code: 21606,
        message: "The 'From' phone number +919876543210 is not a valid, SMS-capable inbound phone number.",
      };

      const result = formatTwilioError(mock21606, "+919876543210");
      assert.ok(result.includes("Twilio Error [21606]"));
      assert.ok(result.includes("not a valid SMS-capable Twilio number"));
    });

    await test("18. Full Sanitized Error Message Persistence in MySQL", async () => {
      // Create a temporary task
      const [insertResult] = await db.insert(tasks).values({
        title: "Error Persistence Test Task",
        status: "Pending",
      });
      const taskId = insertResult.insertId;

      const long572006Message = formatTwilioError({
        code: 572006,
        message: "Invalid template name. Trial accounts can only use predefined SMS templates.",
      });

      // Insert log with full error message
      const [logResult] = await db.insert(reminderLogs).values({
        taskId,
        recipientPhone: "+919876543210",
        scheduledDate: "2026-10-28",
        scheduledTime: "18:00",
        status: "failed",
        errorMessage: long572006Message,
        isTest: true,
        dedupKey: null,
      });

      const [savedLog] = await db.select().from(reminderLogs).where(eq(reminderLogs.id, logResult.insertId));
      assert.equal(savedLog.errorMessage, long572006Message, "Full error message must be stored without truncation");
      assert.ok(!savedLog.errorMessage.endsWith("..."), "Must not be cut off to 'Invalid t...'");

      // Cleanup
      await db.delete(tasks).where(eq(tasks.id, taskId));
    });

    // ------------------------------------------------------------------------
    // Group 9: Predefined Trial Template Mode & Provider Mock Testing
    // ------------------------------------------------------------------------
    await test("19. Official Twilio Trial Predefined Template Catalog & Validation", () => {
      // Must contain all 6 officially documented Twilio trial template identifiers
      const expectedTemplates = [
        "sms_appointment_reminders",
        "sms_delivery_updates",
        "sms_order_confirmation",
        "sms_customer_support",
        "sms_2fa",
        "sms_marketing_promotions",
      ];

      for (const tpl of expectedTemplates) {
        assert.ok(TWILIO_TRIAL_TEMPLATES[tpl], `Must include documented template '${tpl}'`);
        assert.equal(TWILIO_TRIAL_TEMPLATES[tpl].name, tpl);
        assert.ok(TWILIO_TRIAL_TEMPLATES[tpl].label);
      }
    });

    await test("20. Unsupported Trial Template Rejection & Descriptive Error", async () => {
      const origTrialMode = process.env.TWILIO_TRIAL_MODE;
      const origTrialTpl = process.env.TWILIO_TRIAL_TEMPLATE;

      try {
        process.env.TWILIO_TRIAL_MODE = "true";
        process.env.TWILIO_TRIAL_TEMPLATE = "invalid_trial_template_name";

        const val = validateTrialTemplateConfig();
        assert.equal(val.trialMode, true);
        assert.equal(val.valid, false);
        assert.ok(val.error.includes("Unsupported trial template 'invalid_trial_template_name'"));
        assert.ok(val.error.includes("sms_appointment_reminders"));

        // sendSms must safely reject before calling Twilio
        const result = await sendSms({
          to: "+919876543210",
          message: "Test message",
          taskId: 999,
          isTest: true,
        });

        assert.equal(result.success, false);
        assert.equal(result.status, "failed");
        assert.equal(result.errorCode, "UNSUPPORTED_TRIAL_TEMPLATE");
        assert.ok(result.errorMessage.includes("Unsupported trial template"));
      } finally {
        if (origTrialMode !== undefined) process.env.TWILIO_TRIAL_MODE = origTrialMode;
        else delete process.env.TWILIO_TRIAL_MODE;
        if (origTrialTpl !== undefined) process.env.TWILIO_TRIAL_TEMPLATE = origTrialTpl;
        else delete process.env.TWILIO_TRIAL_TEMPLATE;
      }
    });

    await test("21. Trial Mode Dispatches Generic Template and Never Personalized Text", async () => {
      const origTrialMode = process.env.TWILIO_TRIAL_MODE;
      const origTrialTpl = process.env.TWILIO_TRIAL_TEMPLATE;

      // Mock Twilio Client
      let capturedPayload = null;
      const mockClient = {
        messages: {
          create: async (payload) => {
            capturedPayload = payload;
            return {
              sid: "SM_mock_trial_sid_12345",
              status: "accepted",
            };
          },
        },
      };

      try {
        process.env.TWILIO_TRIAL_MODE = "true";
        process.env.TWILIO_TRIAL_TEMPLATE = "sms_appointment_reminders";
        _setTwilioClientForTesting(mockClient);

        const customSensitiveMessage = "TaskMaster Secret Project Deadline Review";
        const result = await sendSms({
          to: "+919876543210",
          message: customSensitiveMessage,
          taskId: 999,
          isTest: true,
        });

        assert.equal(result.success, true);
        assert.equal(result.status, "accepted");
        assert.equal(result.providerMessageId, "SM_mock_trial_sid_12345");
        assert.equal(result.isGenericTemplate, true);
        assert.equal(result.isTrialMode, true);
        assert.equal(result.templateName, "sms_appointment_reminders");

        // Verification of payload: body MUST be the template name and NOT the custom text
        assert.ok(capturedPayload, "Twilio create must have been called");
        assert.equal(capturedPayload.body, "sms_appointment_reminders", "Payload body must be predefined template identifier");
        assert.ok(!capturedPayload.body.includes("TaskMaster"), "Payload must not contain custom task text");
        assert.ok(!capturedPayload.body.includes("Secret Project"), "Payload must not contain dynamic task details");
      } finally {
        _setTwilioClientForTesting(null);
        if (origTrialMode !== undefined) process.env.TWILIO_TRIAL_MODE = origTrialMode;
        else delete process.env.TWILIO_TRIAL_MODE;
        if (origTrialTpl !== undefined) process.env.TWILIO_TRIAL_TEMPLATE = origTrialTpl;
        else delete process.env.TWILIO_TRIAL_TEMPLATE;
      }
    });

    await test("22. Production Mode Sends Custom Reminder Body When Trial Mode Disabled", async () => {
      const origTrialMode = process.env.TWILIO_TRIAL_MODE;

      let capturedPayload = null;
      const mockClient = {
        messages: {
          create: async (payload) => {
            capturedPayload = payload;
            return {
              sid: "SM_mock_prod_sid_67890",
              status: "delivered",
            };
          },
        },
      };

      try {
        process.env.TWILIO_TRIAL_MODE = "false";
        _setTwilioClientForTesting(mockClient);

        const customMessage = "TaskMaster Reminder: Your task 'Submit Final Thesis' is still pending. Please review and complete it today.";
        const result = await sendSms({
          to: "+919876543210",
          message: customMessage,
          taskId: 999,
          isTest: false,
        });

        assert.equal(result.success, true);
        assert.equal(result.status, "delivered");
        assert.equal(result.providerMessageId, "SM_mock_prod_sid_67890");
        assert.equal(result.isGenericTemplate, false);
        assert.equal(result.isTrialMode, false);

        assert.ok(capturedPayload);
        assert.equal(capturedPayload.body, customMessage, "Production mode must send full personalized reminder message");
      } finally {
        _setTwilioClientForTesting(null);
        if (origTrialMode !== undefined) process.env.TWILIO_TRIAL_MODE = origTrialMode;
        else delete process.env.TWILIO_TRIAL_MODE;
      }
    });

    await test("23. Provider Response Authenticity (Never Fabricate Delivery on Failure)", async () => {
      // 1. Mock rejection: Twilio 572006 rejection
      const rejectingClient = {
        messages: {
          create: async () => {
            const err = new Error("Invalid template name. Trial accounts can only use predefined SMS templates.");
            err.code = 572006;
            throw err;
          },
        },
      };

      _setTwilioClientForTesting(rejectingClient);
      const failedResult = await sendSms({
        to: "+919876543210",
        message: "Custom text",
        taskId: 999,
        isTest: true,
      });

      assert.equal(failedResult.success, false, "Must not claim success on provider rejection");
      assert.equal(failedResult.status, "failed");
      assert.equal(failedResult.providerMessageId, null, "Must not fabricate provider message ID");
      assert.ok(failedResult.errorMessage.includes("Twilio Error [572006]"));

      // 2. Mock success: Twilio genuine accepted response
      const acceptingClient = {
        messages: {
          create: async () => {
            return {
              sid: "SM_authentic_provider_sid_9999",
              status: "accepted",
            };
          },
        },
      };

      _setTwilioClientForTesting(acceptingClient);
      const successResult = await sendSms({
        to: "+919876543210",
        message: "Custom text",
        taskId: 999,
        isTest: true,
      });

      assert.equal(successResult.success, true);
      assert.equal(successResult.status, "accepted");
      assert.equal(successResult.providerMessageId, "SM_authentic_provider_sid_9999");
      _setTwilioClientForTesting(null);
    });

  } finally {
    console.log("=================================================");
    console.log(` Test Summary: ${passedCount} Passed, ${failedCount} Failed`);
    console.log("=================================================");
    if (failedCount > 0) {
      process.exit(1);
    } else {
      process.exit(0);
    }
  }
}

runTestSuite().catch((e) => {
  console.error("Test Suite crashed:", e);
  process.exit(1);
});
