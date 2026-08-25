PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_signatory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barangay_id` integer NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`designation` text NOT NULL,
	`effective_from` text NOT NULL,
	FOREIGN KEY (`barangay_id`) REFERENCES `barangay`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "signatory_role_valid" CHECK("__new_signatory"."role" IN ('prepared_by','certified_by','approved_by'))
);
--> statement-breakpoint
INSERT INTO `__new_signatory`("id", "barangay_id", "role", "name", "designation", "effective_from") SELECT "id", "barangay_id", "role", "name", "designation", "effective_from" FROM `signatory`;--> statement-breakpoint
DROP TABLE `signatory`;--> statement-breakpoint
ALTER TABLE `__new_signatory` RENAME TO `signatory`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `signatory_barangay_role_effective_uq` ON `signatory` (`barangay_id`,`role`,`effective_from`);