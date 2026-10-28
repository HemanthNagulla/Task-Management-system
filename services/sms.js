import twilio from "twilio";
import dotenv from "dotenv";
import { DateTime } from "luxon";

dotenv.config();

const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
const fromNumber = process.env.TWILIO_PHONE_NUMBER?.trim();
const appTimezone = process.env.APP_TIMEZONE?.trim() || "Asia/Kolkata";

let twilioClient = null;

if (accountSid && authToken && fromNumber) {
  try {
    twilioClient = twilio(accountSid, authToken);
    console.log("✓ Twilio SMS Client initialized successfully.");
  } catch (err) {
    console.warn("⚠️ Failed to initialize Twilio client:", err.message);
    twilioClient = null;
  }
} else {
  console.log("ℹ️ Twilio credentials not fully configured. SMS features will run in mock/unconfigured mode.");
}

/**
 * Allow test suites to inject a mocked Twilio client
 */
export function _setTwilioClientForTesting(client) {
  twilioClient = client;
}

/**
 * Official Twilio predefined SMS template identifiers supported on trial accounts.
 * On Twilio trial accounts, the 'body' parameter must match one of these identifiers.
 * Custom text bodies trigger Error 572006.
 */
export const TWILIO_TRIAL_TEMPLATES = {
  sms_appointment_reminders: {
    name: "sms_appointment_reminders",
    label: "Appointment / Task Reminder",
    category: "reminders",
    description: "Twilio predefined appointment reminder template for trial accounts",
  },
  sms_delivery_updates: {
    name: "sms_delivery_updates",
    label: "Delivery / Deadline Update",
    category: "updates",
    description: "Twilio predefined delivery update template for trial accounts",
  },
  sms_order_confirmation: {
    name: "sms_order_confirmation",
    label: "Order / Activity Confirmation",
    category: "confirmation",
    description: "Twilio predefined confirmation template for trial accounts",
  },
  sms_customer_support: {
    name: "sms_customer_support",
    label: "Customer Support Notification",
    category: "support",
    description: "Twilio predefined support notification template for trial accounts",
  },
  sms_2fa: {
    name: "sms_2fa",
    label: "Two-Factor Verification Code",
    category: "security",
    description: "Twilio predefined 2FA verification code template for trial accounts",
  },
  sms_marketing_promotions: {
    name: "sms_marketing_promotions",
    label: "Marketing Promotion",
    category: "marketing",
    description: "Twilio predefined promotional notification template for trial accounts",
  },
};

/**
 * Check if Twilio Trial Template Mode is active
 */
export function isTrialModeEnabled() {
  const mode = process.env.TWILIO_TRIAL_MODE?.trim().toLowerCase();
  return mode === "true" || mode === "1" || mode === "yes";
}

/**
 * Get configured trial template name (defaults to sms_appointment_reminders)
 */
export function getTrialTemplateName() {
  return process.env.TWILIO_TRIAL_TEMPLATE?.trim() || "sms_appointment_reminders";
}

/**
 * Validate trial template configuration
 */
export function validateTrialTemplateConfig() {
  const trialMode = isTrialModeEnabled();
  if (!trialMode) {
    return {
      trialMode: false,
      valid: true,
      template: null,
      error: null,
      supportedTemplates: Object.keys(TWILIO_TRIAL_TEMPLATES),
    };
  }

  const templateName = getTrialTemplateName();
  const templateDef = TWILIO_TRIAL_TEMPLATES[templateName];

  if (!templateDef) {
    return {
      trialMode: true,
      valid: false,
      template: templateName,
      templateDef: null,
      error: `Unsupported trial template '${templateName}'. Twilio trial accounts only support predefined templates: ${Object.keys(TWILIO_TRIAL_TEMPLATES).join(", ")}.`,
      supportedTemplates: Object.keys(TWILIO_TRIAL_TEMPLATES),
    };
  }

  return {
    trialMode: true,
    valid: true,
    template: templateName,
    templateDef,
    error: null,
    supportedTemplates: Object.keys(TWILIO_TRIAL_TEMPLATES),
  };
}

/**
 * Check if SMS provider is configured with credentials
 */
export function isSmsConfigured() {
  return Boolean(twilioClient && accountSid && authToken && fromNumber);
}

/**
 * Return safe configuration status without exposing credentials
 */
export function getSmsConfigStatus() {
  const configured = isSmsConfigured();
  const trialValidation = validateTrialTemplateConfig();

  let message = "SMS provider active in Production Custom message mode.";
  if (!configured) {
    message = "SMS provider credentials missing. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_PHONE_NUMBER in .env";
  } else if (trialValidation.trialMode) {
    message = trialValidation.valid
      ? `SMS provider active in Trial-Template mode using '${trialValidation.template}'.`
      : `SMS provider configuration warning: ${trialValidation.error}`;
  }

  return {
    configured,
    provider: "Twilio SMS",
    fromNumber: configured ? maskPhoneNumber(fromNumber) : null,
    defaultTimezone: appTimezone,
    trialMode: trialValidation.trialMode,
    trialTemplate: trialValidation.template,
    trialTemplateValid: trialValidation.valid,
    trialTemplateError: trialValidation.error,
    supportedTrialTemplates: Object.keys(TWILIO_TRIAL_TEMPLATES),
    modeDescription: trialValidation.trialMode
      ? `Twilio Trial Mode Active (${trialValidation.template || "unsupported"}). Reminders send generic predefined templates. Personalized task titles are disabled by Twilio trial policy.`
      : "Production Custom SMS Mode. Personalized TaskMaster reminder messages enabled.",
    message,
  };
}

/**
 * Mask mobile numbers for safe UI display and log entries
 * E.g. +919876543210 -> +91 ******3210
 */
export function maskPhoneNumber(phone) {
  if (!phone || typeof phone !== "string") return "";
  const cleaned = phone.trim();
  if (cleaned.length <= 5) return "***";
  const start = cleaned.slice(0, 3);
  const end = cleaned.slice(-4);
  const maskedLength = Math.max(cleaned.length - 7, 3);
  return `${start}${"*".repeat(maskedLength)}${end}`;
}

/**
 * Validate phone number (must be E.164 formatted, e.g. +919876543210)
 */
export function validatePhoneNumber(phone) {
  if (!phone || typeof phone !== "string") {
    return { valid: false, message: "Phone number is required." };
  }
  const cleanPhone = phone.trim().replace(/[\s-]/g, "");
  // E.164: + followed by 8 to 15 digits
  const e164Regex = /^\+[1-9]\d{7,14}$/;
  if (!e164Regex.test(cleanPhone)) {
    return {
      valid: false,
      message: "Phone number must include international country code in E.164 format (e.g. +919876543210).",
    };
  }
  return { valid: true, phone: cleanPhone };
}

/**
 * Validate IANA timezone
 */
export function validateTimezone(tz) {
  if (!tz || typeof tz !== "string") return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz.trim() });
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Validate HH:mm time string (24-hour)
 */
export function validateReminderTime(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return false;
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr.trim());
}

/**
 * Format message template with sanitized task title
 * Template: "TaskMaster Reminder: Your task '{{task_title}}' is still pending. Please review and complete it today."
 */
export function formatReminderMessage(taskTitle) {
  const cleanTitle = (taskTitle || "Untitled Task")
    .toString()
    .replace(/[\r\n]+/g, " ")
    .trim()
    .slice(0, 60); // Keep reasonable to stay within 160 GSM-7 characters

  return `TaskMaster Reminder: Your task '${cleanTitle}' is still pending. Please review and complete it today.`;
}

/**
 * Format and sanitize Twilio provider errors with detailed actionable guidance
 */
export function formatTwilioError(error, fromNumber = null, maskedDest = null) {
  if (!error) return "Unknown provider error";
  const errorCode = error.code ? String(error.code) : null;
  const rawMessage = error.message || "Failed to deliver SMS via provider";

  if (
    errorCode === "572006" ||
    rawMessage.includes("572006") ||
    rawMessage.toLowerCase().includes("predefined sms templates")
  ) {
    return "Twilio Error [572006]: Trial account restriction. Twilio trial accounts cannot send custom SMS reminder bodies. The Twilio account must be upgraded to paid status, or enabled with TWILIO_TRIAL_MODE=true using an approved predefined template (e.g. TWILIO_TRIAL_TEMPLATE=sms_appointment_reminders).";
  }

  if (errorCode === "21608" || rawMessage.toLowerCase().includes("unverified")) {
    const destStr = maskedDest ? ` ${maskedDest}` : "";
    return `Twilio Error [21608]: Recipient${destStr} is unverified. Twilio trial accounts can only send SMS to phone numbers verified under Twilio Console > Verified Caller IDs.`;
  }

  if (errorCode === "21606" || errorCode === "21212") {
    const fromStr = fromNumber ? ` (${maskPhoneNumber(fromNumber)})` : "";
    return `Twilio Error [${errorCode}]: 'From' phone number${fromStr} is not a valid SMS-capable Twilio number owned by this account. Please obtain a Twilio phone number from Twilio Console.`;
  }

  if (errorCode) {
    return `Twilio Error [${errorCode}]: ${rawMessage}`;
  }

  return rawMessage;
}

/**
 * Send an SMS using Twilio provider with comprehensive trial/production routing
 */
export async function sendSms({ to, message, taskId, isTest = false }) {
  const phoneValidation = validatePhoneNumber(to);
  if (!phoneValidation.valid) {
    return {
      success: false,
      status: "failed",
      errorMessage: phoneValidation.message,
      providerMessageId: null,
      errorCode: "INVALID_PHONE",
    };
  }

  const destinationPhone = phoneValidation.phone;
  const maskedDest = maskPhoneNumber(destinationPhone);

  // Validate trial mode configuration if active
  const trialValidation = validateTrialTemplateConfig();
  if (trialValidation.trialMode && !trialValidation.valid) {
    console.warn(`[SMS Service] Send rejected: ${trialValidation.error}`);
    return {
      success: false,
      status: "failed",
      errorMessage: `Trial Template Configuration Error: ${trialValidation.error}`,
      providerMessageId: null,
      errorCode: "UNSUPPORTED_TRIAL_TEMPLATE",
      isTrialMode: true,
      templateName: trialValidation.template,
    };
  }

  if (!isSmsConfigured()) {
    console.warn(`[SMS Mock] Simulated send to ${maskedDest} for task ${taskId}: "${message}"`);
    return {
      success: false,
      status: "failed",
      errorMessage: "SMS provider not configured (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN missing in .env).",
      providerMessageId: null,
      errorCode: "NOT_CONFIGURED",
      isSimulated: true,
      isTrialMode: trialValidation.trialMode,
    };
  }

  try {
    const messagePayload = {
      from: fromNumber,
      to: destinationPhone,
    };

    let dispatchType = "CUSTOM_REMINDER";
    let isGenericTemplate = false;

    if (trialValidation.trialMode) {
      // In trial-template mode:
      // Twilio documented trial requirement: body must be the predefined template name.
      // Custom task title / reminder wording must NEVER be sent as body in trial mode!
      messagePayload.body = trialValidation.template;
      dispatchType = `TRIAL_TEMPLATE[${trialValidation.template}]`;
      isGenericTemplate = true;

      console.log(
        `[SMS Service] Dispatching ${isTest ? "TEST" : "SCHEDULED"} using Twilio trial template '${trialValidation.template}' to ${maskedDest} for task ${taskId} (Note: generic template, custom task title omitted per trial restriction)`
      );
    } else {
      // Production mode: custom personalized reminder body
      const contentSid = process.env.TWILIO_CONTENT_SID?.trim();
      if (contentSid) {
        messagePayload.contentSid = contentSid;
        messagePayload.contentVariables = JSON.stringify({ "1": message });
        dispatchType = `CONTENT_SID[${contentSid}]`;
      } else {
        messagePayload.body = message;
      }

      console.log(
        `[SMS Service] Dispatching ${isTest ? "TEST" : "SCHEDULED"} custom reminder to ${maskedDest} for task ${taskId}`
      );
    }

    const result = await twilioClient.messages.create(messagePayload);

    // Twilio statuses: 'queued', 'sending', 'sent', 'delivered', 'undelivered', 'failed'
    let mappedStatus = "accepted";
    if (result.status === "delivered") mappedStatus = "delivered";
    else if (result.status === "failed" || result.status === "undelivered") mappedStatus = "failed";

    return {
      success: true,
      status: mappedStatus,
      providerMessageId: result.sid,
      errorMessage: result.errorMessage || null,
      errorCode: null,
      isTrialMode: trialValidation.trialMode,
      templateName: trialValidation.trialMode ? trialValidation.template : null,
      isGenericTemplate,
      dispatchType,
      sentBody: messagePayload.body || null,
      note: isGenericTemplate
        ? `Delivered generic Twilio trial template '${trialValidation.template}'. Twilio trial accounts receive generic templates without personalized task titles.`
        : null,
    };
  } catch (error) {
    console.error(`[SMS Service] Error sending SMS to ${maskedDest}:`, error.message);

    const safeMessage = formatTwilioError(error, fromNumber, maskedDest);

    return {
      success: false,
      status: "failed",
      providerMessageId: error.sid || null,
      errorMessage: safeMessage,
      errorCode: error.code ? String(error.code) : null,
      isTrialMode: trialValidation.trialMode,
      templateName: trialValidation.trialMode ? trialValidation.template : null,
      isGenericTemplate: trialValidation.trialMode,
    };
  }
}
