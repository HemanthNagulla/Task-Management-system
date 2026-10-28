import { mysqlTable, int, varchar, text, mysqlEnum, timestamp, date, boolean, uniqueIndex, index } from "drizzle-orm/mysql-core";

export const tasks = mysqlTable("tasks", {
  id: int("id").autoincrement().primaryKey(),
  title: varchar("title", { length: 255 }).notNull(),
  description: text("description"),
  status: mysqlEnum("status", ["Pending", "Completed"]).default("Pending").notNull(),
  deadline: date("deadline", { mode: "string" }),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const taskReminders = mysqlTable(
  "task_reminders",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    enabled: boolean("enabled").default(false).notNull(),
    phoneNumber: varchar("phoneNumber", { length: 30 }),
    reminderTime: varchar("reminderTime", { length: 5 }).default("09:00").notNull(),
    timezone: varchar("timezone", { length: 64 }).default("Asia/Kolkata").notNull(),
    consentGiven: boolean("consentGiven").default(false).notNull(),
    createdAt: timestamp("createdAt").defaultNow().notNull(),
    updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  },
  (table) => ({
    taskIdx: uniqueIndex("task_reminders_task_id_unique").on(table.taskId),
  })
);

export const reminderLogs = mysqlTable(
  "reminder_logs",
  {
    id: int("id").autoincrement().primaryKey(),
    taskId: int("taskId")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    recipientPhone: varchar("recipientPhone", { length: 30 }),
    scheduledDate: varchar("scheduledDate", { length: 10 }).notNull(), // Local date: YYYY-MM-DD
    scheduledTime: varchar("scheduledTime", { length: 5 }).notNull(), // Configured time: HH:mm
    status: mysqlEnum("status", ["scheduled", "processing", "accepted", "delivered", "failed", "unknown"]).default("scheduled").notNull(),
    processingStartedAt: timestamp("processingStartedAt"),
    attemptedAt: timestamp("attemptedAt"),
    deliveredAt: timestamp("deliveredAt"),
    providerMessageId: varchar("providerMessageId", { length: 128 }),
    errorMessage: text("errorMessage"),
    isTest: boolean("isTest").default(false).notNull(),
    dedupKey: varchar("dedupKey", { length: 100 }), // null for tests, `${taskId}_${scheduledDate}` for daily scheduled
    createdAt: timestamp("createdAt").defaultNow().notNull(),
  },
  (table) => ({
    taskDateDedupIdx: uniqueIndex("reminder_logs_dedup_key_unique").on(table.dedupKey),
    taskIdx: index("reminder_logs_task_id_idx").on(table.taskId),
    statusIdx: index("reminder_logs_status_idx").on(table.status),
  })
);
