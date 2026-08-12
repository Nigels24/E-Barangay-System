/**
 * Every mutating action in the engine writes one of these. audit_log is
 * append-only (D26/D27 context aside — this is the COA audit trail itself):
 * nothing in this module ever updates or deletes a row here.
 */
import { auditLog } from "../../db/schema";
import type { EngineDb } from "./types";

export function writeAudit(
  db: EngineDb,
  userId: number,
  action: string,
  tableName: string,
  recordId: number,
  before: unknown,
  after: unknown,
): void {
  db.insert(auditLog)
    .values({
      userId,
      action,
      tableName,
      recordId,
      beforeJson: before == null ? null : JSON.stringify(before),
      afterJson: after == null ? null : JSON.stringify(after),
    })
    .run();
}
