/**
 * Period control, per docs/decisions.md.
 *
 * Years are user-controlled, not a fixed list (see schema.ts on
 * accountingPeriod) — the client traces back to 2000 and opens years ahead
 * of the current calendar year, so periods are opened on demand rather than
 * seeded. A closed period can be reopened by an administrator with a
 * written reason (D22): a permanent lock sounds stronger on paper, but in
 * practice it just pushes corrections into a side spreadsheet, which
 * destroys the audit trail instead of protecting it. The reason is
 * captured in the audit log, not on the period row itself.
 */
import { eq, and } from "drizzle-orm";
import { accountingPeriod } from "../../db/schema";
import type { EngineDb } from "./types";
import { InvalidStatusError } from "./errors";
import { writeAudit } from "./audit";

/** Returns the period for (barangay, year, month), opening it if it doesn't exist yet. */
export function ensurePeriod(db: EngineDb, barangayId: number, year: number, month: number) {
  const existing = db
    .select()
    .from(accountingPeriod)
    .where(
      and(
        eq(accountingPeriod.barangayId, barangayId),
        eq(accountingPeriod.year, year),
        eq(accountingPeriod.month, month),
      ),
    )
    .get();
  if (existing) return existing;

  return db
    .insert(accountingPeriod)
    .values({ barangayId, year, month })
    .returning()
    .get();
}

export function closePeriod(db: EngineDb, periodId: number, closedBy: number) {
  const period = db.select().from(accountingPeriod).where(eq(accountingPeriod.id, periodId)).get();
  if (!period) throw new InvalidStatusError(`Period ${periodId} does not exist`);
  if (period.status === "closed") {
    throw new InvalidStatusError(`Period ${period.year}-${period.month} is already closed`);
  }

  const updated = db
    .update(accountingPeriod)
    .set({ status: "closed", closedAt: new Date().toISOString(), closedBy })
    .where(eq(accountingPeriod.id, periodId))
    .returning()
    .get();

  writeAudit(db, closedBy, "period.close", "accounting_period", periodId, period, updated);
  return updated;
}

export function reopenPeriod(db: EngineDb, periodId: number, reopenedBy: number, reason: string) {
  if (!reason.trim()) throw new InvalidStatusError("A reason is required to reopen a closed period");

  const period = db.select().from(accountingPeriod).where(eq(accountingPeriod.id, periodId)).get();
  if (!period) throw new InvalidStatusError(`Period ${periodId} does not exist`);
  if (period.status !== "closed") {
    throw new InvalidStatusError(`Period ${period.year}-${period.month} is not closed`);
  }

  const updated = db
    .update(accountingPeriod)
    .set({ status: "open", closedAt: null, closedBy: null })
    .where(eq(accountingPeriod.id, periodId))
    .returning()
    .get();

  writeAudit(db, reopenedBy, "period.reopen", "accounting_period", periodId, period, { ...updated, reason });
  return updated;
}
