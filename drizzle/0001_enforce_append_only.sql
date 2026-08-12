-- Enforce the audit-trail guarantees in schema.ts at the database level,
-- not just in application code. A posted or voided journal entry can never
-- be deleted — correcting one means voiding it and posting a reversal
-- (src/lib/engine/void.ts), never removing the row. audit_log is
-- append-only with no exceptions.

CREATE TRIGGER prevent_delete_posted_journal_entry
BEFORE DELETE ON journal_entry
WHEN OLD.status != 'draft'
BEGIN
  SELECT RAISE(ABORT, 'Posted or voided journal entries cannot be deleted — void it instead');
END;
--> statement-breakpoint
CREATE TRIGGER prevent_delete_posted_journal_entry_line
BEFORE DELETE ON journal_entry_line
WHEN (SELECT status FROM journal_entry WHERE id = OLD.entry_id) != 'draft'
BEGIN
  SELECT RAISE(ABORT, 'Lines of a posted or voided journal entry cannot be deleted');
END;
--> statement-breakpoint
CREATE TRIGGER prevent_delete_audit_log
BEFORE DELETE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only and can never be deleted from');
END;
--> statement-breakpoint
CREATE TRIGGER prevent_update_audit_log
BEFORE UPDATE ON audit_log
BEGIN
  SELECT RAISE(ABORT, 'audit_log is append-only and can never be modified');
END;
