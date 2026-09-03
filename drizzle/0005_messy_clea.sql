PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_app_user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text,
	`full_name` text NOT NULL,
	`position` text,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	CONSTRAINT "user_role_valid" CHECK("__new_app_user"."role" IN ('admin','bookkeeper','reviewer'))
);
--> statement-breakpoint
INSERT INTO `__new_app_user`("id", "username", "password_hash", "full_name", "position", "role", "is_active") SELECT "id", "username", "password_hash", "full_name", "position", "role", "is_active" FROM `app_user`;--> statement-breakpoint
DROP TABLE `app_user`;--> statement-breakpoint
ALTER TABLE `__new_app_user` RENAME TO `app_user`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `app_user_username_unique` ON `app_user` (`username`);