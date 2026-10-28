CREATE TABLE `reminder_logs` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`recipientPhone` varchar(30),
	`scheduledDate` varchar(10) NOT NULL,
	`scheduledTime` varchar(5) NOT NULL,
	`status` enum('scheduled','processing','accepted','delivered','failed','unknown') NOT NULL DEFAULT 'scheduled',
	`processingStartedAt` timestamp,
	`attemptedAt` timestamp,
	`deliveredAt` timestamp,
	`providerMessageId` varchar(128),
	`errorMessage` text,
	`isTest` boolean NOT NULL DEFAULT false,
	`dedupKey` varchar(100),
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `reminder_logs_id` PRIMARY KEY(`id`),
	CONSTRAINT `reminder_logs_dedup_key_unique` UNIQUE(`dedupKey`)
);
--> statement-breakpoint
CREATE TABLE `task_reminders` (
	`id` int AUTO_INCREMENT NOT NULL,
	`taskId` int NOT NULL,
	`enabled` boolean NOT NULL DEFAULT false,
	`phoneNumber` varchar(30),
	`reminderTime` varchar(5) NOT NULL DEFAULT '09:00',
	`timezone` varchar(64) NOT NULL DEFAULT 'Asia/Kolkata',
	`consentGiven` boolean NOT NULL DEFAULT false,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	`updatedAt` timestamp NOT NULL DEFAULT (now()) ON UPDATE CURRENT_TIMESTAMP,
	CONSTRAINT `task_reminders_id` PRIMARY KEY(`id`),
	CONSTRAINT `task_reminders_task_id_unique` UNIQUE(`taskId`)
);
--> statement-breakpoint
ALTER TABLE `tasks` ADD `deadline` date;--> statement-breakpoint
ALTER TABLE `reminder_logs` ADD CONSTRAINT `reminder_logs_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE `task_reminders` ADD CONSTRAINT `task_reminders_taskId_tasks_id_fk` FOREIGN KEY (`taskId`) REFERENCES `tasks`(`id`) ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX `reminder_logs_task_id_idx` ON `reminder_logs` (`taskId`);--> statement-breakpoint
CREATE INDEX `reminder_logs_status_idx` ON `reminder_logs` (`status`);