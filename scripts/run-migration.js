import { poolConnection } from "../db/index.js";

async function runMigration() {
  const connection = await poolConnection.getConnection();
  try {
    console.log("Starting safe database migration for SMS reminder tables...");

    // 1. Create reminder_logs table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`reminder_logs\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`taskId\` int NOT NULL,
        \`recipientPhone\` varchar(30),
        \`scheduledDate\` varchar(10) NOT NULL,
        \`scheduledTime\` varchar(5) NOT NULL,
        \`status\` enum('scheduled','processing','accepted','delivered','failed','unknown') NOT NULL DEFAULT 'scheduled',
        \`processingStartedAt\` timestamp NULL,
        \`attemptedAt\` timestamp NULL,
        \`deliveredAt\` timestamp NULL,
        \`providerMessageId\` varchar(128) NULL,
        \`errorMessage\` text NULL,
        \`isTest\` boolean NOT NULL DEFAULT false,
        \`dedupKey\` varchar(100) NULL,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`reminder_logs_dedup_key_unique\` (\`dedupKey\`),
        KEY \`reminder_logs_task_id_idx\` (\`taskId\`),
        KEY \`reminder_logs_status_idx\` (\`status\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✓ Checked/created `reminder_logs` table");

    // 2. Create task_reminders table if not exists
    await connection.query(`
      CREATE TABLE IF NOT EXISTS \`task_reminders\` (
        \`id\` int AUTO_INCREMENT NOT NULL,
        \`taskId\` int NOT NULL,
        \`enabled\` boolean NOT NULL DEFAULT false,
        \`phoneNumber\` varchar(30) NULL,
        \`reminderTime\` varchar(5) NOT NULL DEFAULT '09:00',
        \`timezone\` varchar(64) NOT NULL DEFAULT 'Asia/Kolkata',
        \`consentGiven\` boolean NOT NULL DEFAULT false,
        \`createdAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
        \`updatedAt\` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (\`id\`),
        UNIQUE KEY \`task_reminders_task_id_unique\` (\`taskId\`)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
    `);
    console.log("✓ Checked/created `task_reminders` table");

    // 3. Ensure foreign keys exist safely
    try {
      await connection.query(`
        ALTER TABLE \`reminder_logs\`
        ADD CONSTRAINT \`reminder_logs_taskId_tasks_id_fk\`
        FOREIGN KEY (\`taskId\`) REFERENCES \`tasks\`(\`id\`)
        ON DELETE CASCADE ON UPDATE NO ACTION;
      `);
      console.log("✓ Added foreign key constraint for `reminder_logs`");
    } catch (e) {
      if (e.code === 'ER_DUP_KEY' || e.errno === 1826 || e.message.includes('already exists')) {
        console.log("✓ Foreign key for `reminder_logs` already in place");
      } else {
        console.warn("Notice on reminder_logs FK:", e.message);
      }
    }

    try {
      await connection.query(`
        ALTER TABLE \`task_reminders\`
        ADD CONSTRAINT \`task_reminders_taskId_tasks_id_fk\`
        FOREIGN KEY (\`taskId\`) REFERENCES \`tasks\`(\`id\`)
        ON DELETE CASCADE ON UPDATE NO ACTION;
      `);
      console.log("✓ Added foreign key constraint for `task_reminders`");
    } catch (e) {
      if (e.code === 'ER_DUP_KEY' || e.errno === 1826 || e.message.includes('already exists')) {
        console.log("✓ Foreign key for `task_reminders` already in place");
      } else {
        console.warn("Notice on task_reminders FK:", e.message);
      }
    }

    // Check table structures
    const [tables] = await connection.query("SHOW TABLES;");
    console.log("Current Database Tables:", tables.map(r => Object.values(r)[0]));

    console.log("Migration completed successfully with all existing data preserved!");
  } catch (err) {
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    connection.release();
    process.exit(0);
  }
}

runMigration();
