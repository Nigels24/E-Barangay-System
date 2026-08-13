/**
 * Every mutating action in the engine writes one of these. audit_log is
 * append-only — SQLite triggers refuse both DELETE and UPDATE on it — so
 * nothing here ever modifies an existing row.
 *
 * This builds a statement rather than executing one: the audit row has to
 * land in the *same* write batch as the change it records, or a crash between
 * the two would leave a ledger change with no trail (or a trail with no
 * change). See `src/db/adapter.ts`.
 */
import { auditLog } from "../../db/schema";
import { statement, type BatchStatement, type EngineDb } from "./types";

export function auditStatement(
  db: EngineDb,
  userId: number,
  action: string,
  tableName: string,
  recordId: number,
  before: unknown,
  after: unknown,
): BatchStatement {
  return statement(
    db.query.insert(auditLog).values({
      userId,
      action,
      tableName,
      recordId,
      beforeJson: before == null ? null : JSON.stringify(before),
      afterJson: after == null ? null : JSON.stringify(after),
    }),
  );
}
