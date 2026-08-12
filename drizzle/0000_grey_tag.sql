CREATE TABLE `account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`account_type` text NOT NULL,
	`normal_balance` text NOT NULL,
	`parent_id` integer,
	`is_postable` integer DEFAULT true NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`parent_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "account_type_valid" CHECK("account"."account_type" IN ('asset','liability','equity','income','expense')),
	CONSTRAINT "normal_balance_valid" CHECK("account"."normal_balance" IN ('debit','credit'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `account_code_unique` ON `account` (`code`);--> statement-breakpoint
CREATE TABLE `accounting_period` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barangay_id` integer NOT NULL,
	`year` integer NOT NULL,
	`month` integer NOT NULL,
	`status` text DEFAULT 'open' NOT NULL,
	`closed_at` text,
	`closed_by` integer,
	FOREIGN KEY (`barangay_id`) REFERENCES `barangay`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`closed_by`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "period_status_valid" CHECK("accounting_period"."status" IN ('open','closed')),
	CONSTRAINT "period_month_valid" CHECK("accounting_period"."month" BETWEEN 1 AND 12),
	CONSTRAINT "period_year_sane" CHECK("accounting_period"."year" BETWEEN 1900 AND 2200)
);
--> statement-breakpoint
CREATE UNIQUE INDEX `period_barangay_year_month_uq` ON `accounting_period` (`barangay_id`,`year`,`month`);--> statement-breakpoint
CREATE TABLE `advance_to_officer` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barangay_id` integer NOT NULL,
	`date_granted` text NOT NULL,
	`payee` text NOT NULL,
	`particulars` text NOT NULL,
	`amount_centavos` integer NOT NULL,
	`liquidated_centavos` integer DEFAULT 0 NOT NULL,
	`status` text DEFAULT 'outstanding' NOT NULL,
	`source_entry_id` integer,
	FOREIGN KEY (`barangay_id`) REFERENCES `barangay`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_entry_id`) REFERENCES `journal_entry`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "advance_status_valid" CHECK("advance_to_officer"."status" IN ('outstanding','liquidated'))
);
--> statement-breakpoint
CREATE TABLE `app_user` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`username` text NOT NULL,
	`password_hash` text NOT NULL,
	`full_name` text NOT NULL,
	`position` text,
	`role` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	CONSTRAINT "user_role_valid" CHECK("app_user"."role" IN ('admin','bookkeeper','reviewer'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `app_user_username_unique` ON `app_user` (`username`);--> statement-breakpoint
CREATE TABLE `audit_log` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`user_id` integer NOT NULL,
	`action` text NOT NULL,
	`table_name` text NOT NULL,
	`record_id` integer NOT NULL,
	`before_json` text,
	`after_json` text,
	`at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bank_account` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barangay_id` integer NOT NULL,
	`bank_name` text NOT NULL,
	`account_no` text NOT NULL,
	`account_name` text NOT NULL,
	`gl_account_id` integer NOT NULL,
	`is_active` integer DEFAULT true NOT NULL,
	FOREIGN KEY (`barangay_id`) REFERENCES `barangay`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`gl_account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `bank_reconciliation` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`bank_account_id` integer NOT NULL,
	`period_id` integer NOT NULL,
	`statement_date` text NOT NULL,
	`statement_balance_centavos` integer NOT NULL,
	`book_balance_centavos` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`finalised_at` text,
	`finalised_by` integer,
	`variance_override_reason` text,
	`prepared_by` integer NOT NULL,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `accounting_period`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`finalised_by`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`prepared_by`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "bank_recon_status_valid" CHECK("bank_reconciliation"."status" IN ('draft','final'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `bank_recon_account_period_uq` ON `bank_reconciliation` (`bank_account_id`,`period_id`);--> statement-breakpoint
CREATE TABLE `barangay` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`code` text NOT NULL,
	`name` text NOT NULL,
	`is_active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `barangay_code_unique` ON `barangay` (`code`);--> statement-breakpoint
CREATE TABLE `fixed_asset` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barangay_id` integer NOT NULL,
	`category` text NOT NULL,
	`description` text NOT NULL,
	`acquisition_date` text NOT NULL,
	`cost_centavos` integer NOT NULL,
	`useful_life_years` integer NOT NULL,
	`residual_rate` text DEFAULT '0.10' NOT NULL,
	`account_id` integer,
	`legacy_code` text,
	`disposal_date` text,
	FOREIGN KEY (`barangay_id`) REFERENCES `barangay`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "asset_life_positive" CHECK("fixed_asset"."useful_life_years" > 0),
	CONSTRAINT "asset_cost_non_negative" CHECK("fixed_asset"."cost_centavos" >= 0),
	CONSTRAINT "asset_disposed_after_acquired" CHECK("fixed_asset"."disposal_date" IS NULL OR "fixed_asset"."disposal_date" >= "fixed_asset"."acquisition_date")
);
--> statement-breakpoint
CREATE TABLE `journal_entry` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barangay_id` integer NOT NULL,
	`period_id` integer NOT NULL,
	`jev_no` text,
	`entry_date` text NOT NULL,
	`book` text DEFAULT 'GJ' NOT NULL,
	`particulars` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`check_no` text,
	`check_date` text,
	`cleared_date` text,
	`bank_account_id` integer,
	`posted_at` text,
	`posted_by` integer,
	`voided_at` text,
	`voided_by` integer,
	`void_reason` text,
	`reverses_entry_id` integer,
	`created_by` integer NOT NULL,
	`created_at` text DEFAULT (datetime('now')) NOT NULL,
	FOREIGN KEY (`barangay_id`) REFERENCES `barangay`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`period_id`) REFERENCES `accounting_period`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`bank_account_id`) REFERENCES `bank_account`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`posted_by`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`voided_by`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`reverses_entry_id`) REFERENCES `journal_entry`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`created_by`) REFERENCES `app_user`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "journal_book_valid" CHECK("journal_entry"."book" IN ('GJ','CRJ','CkDJ','CDJ')),
	CONSTRAINT "journal_status_valid" CHECK("journal_entry"."status" IN ('draft','posted','voided')),
	CONSTRAINT "journal_void_requires_reason" CHECK("journal_entry"."status" != 'voided' OR "journal_entry"."void_reason" IS NOT NULL),
	CONSTRAINT "ckdj_requires_check_details" CHECK("journal_entry"."book" != 'CkDJ' OR "journal_entry"."status" != 'posted' OR ("journal_entry"."check_no" IS NOT NULL AND "journal_entry"."check_date" IS NOT NULL)),
	CONSTRAINT "cleared_after_issued" CHECK("journal_entry"."cleared_date" IS NULL OR "journal_entry"."check_date" IS NULL OR "journal_entry"."cleared_date" >= "journal_entry"."check_date")
);
--> statement-breakpoint
CREATE INDEX `journal_entry_barangay_date_idx` ON `journal_entry` (`barangay_id`,`entry_date`);--> statement-breakpoint
CREATE INDEX `journal_entry_period_idx` ON `journal_entry` (`period_id`);--> statement-breakpoint
CREATE TABLE `journal_entry_line` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`entry_id` integer NOT NULL,
	`line_no` integer NOT NULL,
	`account_id` integer NOT NULL,
	`debit_centavos` integer DEFAULT 0 NOT NULL,
	`credit_centavos` integer DEFAULT 0 NOT NULL,
	`memo` text,
	FOREIGN KEY (`entry_id`) REFERENCES `journal_entry`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`account_id`) REFERENCES `account`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "line_amounts_non_negative" CHECK("journal_entry_line"."debit_centavos" >= 0 AND "journal_entry_line"."credit_centavos" >= 0),
	CONSTRAINT "line_exactly_one_side" CHECK(("journal_entry_line"."debit_centavos" > 0 AND "journal_entry_line"."credit_centavos" = 0) OR ("journal_entry_line"."credit_centavos" > 0 AND "journal_entry_line"."debit_centavos" = 0))
);
--> statement-breakpoint
CREATE INDEX `journal_entry_line_entry_idx` ON `journal_entry_line` (`entry_id`);--> statement-breakpoint
CREATE INDEX `journal_entry_line_account_idx` ON `journal_entry_line` (`account_id`);--> statement-breakpoint
CREATE TABLE `reconciling_item` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`reconciliation_id` integer NOT NULL,
	`side` text NOT NULL,
	`item_type` text NOT NULL,
	`amount_centavos` integer NOT NULL,
	`explanation` text,
	`related_entry_id` integer,
	`adjusting_entry_id` integer,
	FOREIGN KEY (`reconciliation_id`) REFERENCES `bank_reconciliation`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`related_entry_id`) REFERENCES `journal_entry`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`adjusting_entry_id`) REFERENCES `journal_entry`(`id`) ON UPDATE no action ON DELETE no action,
	CONSTRAINT "reconciling_side_valid" CHECK("reconciling_item"."side" IN ('bank','book')),
	CONSTRAINT "reconciling_item_type_valid" CHECK("reconciling_item"."item_type" IN ('checks_issued_not_taken_up','checks_issued_overstated','deposit_understated','deposit_overstated','debit_memo','credit_memo','prior_years_adjustment','other')),
	CONSTRAINT "bank_side_never_journalised" CHECK("reconciling_item"."side" != 'bank' OR "reconciling_item"."adjusting_entry_id" IS NULL)
);
--> statement-breakpoint
CREATE INDEX `reconciling_item_recon_idx` ON `reconciling_item` (`reconciliation_id`);--> statement-breakpoint
CREATE TABLE `signatory` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`barangay_id` integer NOT NULL,
	`role` text NOT NULL,
	`name` text NOT NULL,
	`designation` text NOT NULL,
	`effective_from` text NOT NULL,
	FOREIGN KEY (`barangay_id`) REFERENCES `barangay`(`id`) ON UPDATE no action ON DELETE no action
);
