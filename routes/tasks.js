import { Router } from "express";
import { eq, desc } from "drizzle-orm";
import { db } from "../db/index.js";
import { tasks, taskReminders } from "../db/schema.js";
import {
  maskPhoneNumber,
  validatePhoneNumber,
  validateTimezone,
  validateReminderTime,
} from "../services/sms.js";

const router = Router();

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
 * GET /api/tasks - Retrieve all tasks (optional status filter)
 */
router.get("/", async (req, res) => {
  try {
    const { status } = req.query;
    const baseQuery = db
      .select({
        id: tasks.id,
        title: tasks.title,
        description: tasks.description,
        status: tasks.status,
        deadline: tasks.deadline,
        createdAt: tasks.createdAt,
        reminderEnabled: taskReminders.enabled,
        reminderTime: taskReminders.reminderTime,
      })
      .from(tasks)
      .leftJoin(taskReminders, eq(tasks.id, taskReminders.taskId));

    let query;
    if (status && ["Pending", "Completed"].includes(status)) {
      query = baseQuery.where(eq(tasks.status, status)).orderBy(desc(tasks.createdAt));
    } else {
      query = baseQuery.orderBy(desc(tasks.createdAt));
    }

    const taskList = await query;
    return res.status(200).json({
      success: true,
      count: taskList.length,
      data: taskList,
    });
  } catch (error) {
    console.error("Error fetching tasks:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching tasks",
      error: error.message,
    });
  }
});

/**
 * GET /api/tasks/:id - Retrieve a single task by ID with its reminder settings
 */
router.get("/:id", async (req, res) => {
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

    const task = taskResult[0];

    // Fetch associated reminder settings if any
    const reminderResult = await db
      .select()
      .from(taskReminders)
      .where(eq(taskReminders.taskId, taskId));

    const reminder = reminderResult && reminderResult.length > 0 ? reminderResult[0] : null;

    return res.status(200).json({
      success: true,
      data: {
        ...task,
        reminder: reminder
          ? {
              ...reminder,
              phoneNumberMasked: maskPhoneNumber(reminder.phoneNumber),
            }
          : null,
      },
    });
  } catch (error) {
    console.error("Error fetching task by ID:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while fetching task",
      error: error.message,
    });
  }
});

/**
 * POST /api/tasks - Create a new task (with optional reminder settings)
 */
router.post("/", async (req, res) => {
  try {
    const { title, description, status, deadline, reminder } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Title is required and must not be empty.",
      });
    }

    const cleanTitle = title.trim();
    if (cleanTitle.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Title cannot exceed 255 characters.",
      });
    }

    let taskStatus = "Pending";
    if (status) {
      if (!["Pending", "Completed"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be either 'Pending' or 'Completed'.",
        });
      }
      taskStatus = status;
    }

    const cleanDescription = description && typeof description === "string" ? description.trim() : null;
    const cleanDeadline = deadline && typeof deadline === "string" && deadline.trim() ? deadline.trim() : null;

    // Validate reminder payload if enabled
    if (reminder && reminder.enabled) {
      if (!reminder.consentGiven) {
        return res.status(400).json({
          success: false,
          message: "User consent is required before enabling daily SMS reminders.",
        });
      }

      const phoneValidation = validatePhoneNumber(reminder.phoneNumber);
      if (!phoneValidation.valid) {
        return res.status(400).json({
          success: false,
          message: phoneValidation.message,
        });
      }

      if (reminder.reminderTime && !validateReminderTime(reminder.reminderTime)) {
        return res.status(400).json({
          success: false,
          message: "Invalid reminder time format. Use HH:mm in 24-hour format (e.g. 09:00).",
        });
      }

      if (reminder.timezone && !validateTimezone(reminder.timezone)) {
        return res.status(400).json({
          success: false,
          message: `Invalid timezone "${reminder.timezone}".`,
        });
      }
    }

    const [insertResult] = await db.insert(tasks).values({
      title: cleanTitle,
      description: cleanDescription,
      status: taskStatus,
      deadline: cleanDeadline,
    });

    const newTaskId = insertResult.insertId;

    // Save reminder settings if provided
    if (reminder) {
      const isEnabled = Boolean(reminder.enabled);
      const phoneValidation = validatePhoneNumber(reminder.phoneNumber);
      const cleanPhone = phoneValidation.valid ? phoneValidation.phone : reminder.phoneNumber || null;
      const cleanTime = reminder.reminderTime ? String(reminder.reminderTime).trim() : "09:00";
      const cleanTz = reminder.timezone ? String(reminder.timezone).trim() : process.env.APP_TIMEZONE || "Asia/Kolkata";

      await db.insert(taskReminders).values({
        taskId: newTaskId,
        enabled: isEnabled,
        phoneNumber: cleanPhone,
        reminderTime: cleanTime,
        timezone: cleanTz,
        consentGiven: Boolean(reminder.consentGiven),
      });
    }

    const [createdTask] = await db.select().from(tasks).where(eq(tasks.id, newTaskId));

    return res.status(201).json({
      success: true,
      message: "Task created successfully.",
      data: createdTask,
    });
  } catch (error) {
    console.error("Error creating task:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while creating task",
      error: error.message,
    });
  }
});

/**
 * PUT /api/tasks/:id - Update full task details
 */
router.put("/:id", async (req, res) => {
  try {
    const taskId = parseId(req.params.id);
    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID. ID must be a positive integer.",
      });
    }

    const existingTasks = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!existingTasks || existingTasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${taskId} not found.`,
      });
    }

    const { title, description, status, deadline, reminder } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({
        success: false,
        message: "Title is required and must not be empty.",
      });
    }

    const cleanTitle = title.trim();
    if (cleanTitle.length > 255) {
      return res.status(400).json({
        success: false,
        message: "Title cannot exceed 255 characters.",
      });
    }

    let taskStatus = existingTasks[0].status;
    if (status !== undefined) {
      if (!["Pending", "Completed"].includes(status)) {
        return res.status(400).json({
          success: false,
          message: "Status must be either 'Pending' or 'Completed'.",
        });
      }
      taskStatus = status;
    }

    const cleanDescription = description !== undefined
      ? (typeof description === "string" ? description.trim() : null)
      : existingTasks[0].description;

    const cleanDeadline = deadline !== undefined
      ? (deadline && typeof deadline === "string" && deadline.trim() ? deadline.trim() : null)
      : existingTasks[0].deadline;

    await db.update(tasks).set({
      title: cleanTitle,
      description: cleanDescription,
      status: taskStatus,
      deadline: cleanDeadline,
    }).where(eq(tasks.id, taskId));

    // If reminder object is provided, update task_reminders
    if (reminder) {
      const isEnabled = Boolean(reminder.enabled);
      let cleanPhone = null;
      let cleanTime = reminder.reminderTime ? String(reminder.reminderTime).trim() : "09:00";
      let cleanTz = reminder.timezone ? String(reminder.timezone).trim() : process.env.APP_TIMEZONE || "Asia/Kolkata";

      if (isEnabled) {
        if (!reminder.consentGiven) {
          return res.status(400).json({
            success: false,
            message: "User consent is required before enabling daily SMS reminders.",
          });
        }
        const phoneValidation = validatePhoneNumber(reminder.phoneNumber);
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
            message: "Invalid reminder time format (HH:mm).",
          });
        }

        if (!validateTimezone(cleanTz)) {
          return res.status(400).json({
            success: false,
            message: `Invalid timezone "${cleanTz}".`,
          });
        }
      } else if (reminder.phoneNumber) {
        const phoneValidation = validatePhoneNumber(reminder.phoneNumber);
        cleanPhone = phoneValidation.valid ? phoneValidation.phone : reminder.phoneNumber;
      }

      const existingReminders = await db.select().from(taskReminders).where(eq(taskReminders.taskId, taskId));
      if (existingReminders.length > 0) {
        await db.update(taskReminders).set({
          enabled: isEnabled,
          phoneNumber: cleanPhone,
          reminderTime: cleanTime,
          timezone: cleanTz,
          consentGiven: Boolean(reminder.consentGiven),
        }).where(eq(taskReminders.taskId, taskId));
      } else {
        await db.insert(taskReminders).values({
          taskId,
          enabled: isEnabled,
          phoneNumber: cleanPhone,
          reminderTime: cleanTime,
          timezone: cleanTz,
          consentGiven: Boolean(reminder.consentGiven),
        });
      }
    }

    const [updatedTask] = await db.select().from(tasks).where(eq(tasks.id, taskId));

    return res.status(200).json({
      success: true,
      message: "Task updated successfully.",
      data: updatedTask,
    });
  } catch (error) {
    console.error("Error updating task:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating task",
      error: error.message,
    });
  }
});

/**
 * PATCH /api/tasks/:id/status - Toggle or change task status
 */
router.patch("/:id/status", async (req, res) => {
  try {
    const taskId = parseId(req.params.id);
    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID. ID must be a positive integer.",
      });
    }

    const { status } = req.body;
    if (!status || !["Pending", "Completed"].includes(status)) {
      return res.status(400).json({
        success: false,
        message: "Status must be either 'Pending' or 'Completed'.",
      });
    }

    const existingTasks = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!existingTasks || existingTasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${taskId} not found.`,
      });
    }

    await db.update(tasks).set({ status }).where(eq(tasks.id, taskId));

    const [updatedTask] = await db.select().from(tasks).where(eq(tasks.id, taskId));

    return res.status(200).json({
      success: true,
      message: `Task status updated to ${status}.`,
      data: updatedTask,
    });
  } catch (error) {
    console.error("Error patching task status:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while updating task status",
      error: error.message,
    });
  }
});

/**
 * DELETE /api/tasks/:id - Delete a task
 */
router.delete("/:id", async (req, res) => {
  try {
    const taskId = parseId(req.params.id);
    if (!taskId) {
      return res.status(400).json({
        success: false,
        message: "Invalid task ID. ID must be a positive integer.",
      });
    }

    const existingTasks = await db.select().from(tasks).where(eq(tasks.id, taskId));
    if (!existingTasks || existingTasks.length === 0) {
      return res.status(404).json({
        success: false,
        message: `Task with ID ${taskId} not found.`,
      });
    }

    await db.delete(tasks).where(eq(tasks.id, taskId));

    return res.status(200).json({
      success: true,
      message: `Task with ID ${taskId} deleted successfully.`,
      data: { id: taskId },
    });
  } catch (error) {
    console.error("Error deleting task:", error);
    return res.status(500).json({
      success: false,
      message: "Server error while deleting task",
      error: error.message,
    });
  }
});

export default router;
