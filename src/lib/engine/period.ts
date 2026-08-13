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
import { statement, type EngineDb } from "./types";
import { InvalidStatusError } from "./errors";
import { auditStatement } from "./audit";
import { nextRowId } from "./ids";

/** Returns the period for (barangay, year, month), opening it if it doesn't exist yet. */
export async function ensurePeriod(db: EngineDb, barangayId: number, year: number, month: number) {
  const existing = await db.query
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

  const id = await nextRowId(db, "accounting_period");
  // A lone INSERT is atomic on its own — SQLite wraps it in an implicit
  // transaction — so this needs no batch. It still goes through writeBatch for
  // one reason: every write in the engine then takes the same path.
  await db.writeBatch([statement(db.query.insert(accountingPeriod).values({ id, barangayId, year, month }))]);

  return readPeriod(db, id);
}

async function readPeriod(db: EngineDb, periodId: number) {
  const period = await db.query.select().from(accountingPeriod).where(eq(accountingPeriod.id, periodId)).get();
  if (!period) throw new InvalidStatusError(`Period ${periodId} does not exist`);
  return period;
}

export async function closePeriod(db: EngineDb, periodId: number, closedBy: number) {
  const period = await db.query.select().from(accountingPeriod).where(eq(accountingPeriod.id, periodId)).get();
  if (!period) throw new InvalidStatusError(`Period ${periodId} does not exist`);
  if (period.status === "closed") {
    throw new InvalidStatusError(`Period ${period.year}-${period.month} is already closed`);
  }

  const closed = { status: "closed" as const, closedAt: new Date().toISOString(), closedBy };

  await db.writeBatch([
    statement(db.query.update(accountingPeriod).set(closed).where(eq(accountingPeriod.id, periodId))),
    auditStatement(db, closedBy, "period.close", "accounting_period", periodId, period, {
      ...period,
      ...closed,
    }),
  ]);

  return readPeriod(db, periodId);
}

export async function reopenPeriod(db: EngineDb, periodId: number, reopenedBy: number, reason: string) {
  if (!reason.trim()) throw new InvalidStatusError("A reason is required to reopen a closed period");

  const period = await db.query.select().from(accountingPeriod).where(eq(accountingPeriod.id, periodId)).get();
  if (!period) throw new InvalidStatusError(`Period ${periodId} does not exist`);
  if (period.status !== "closed") {
    throw new InvalidStatusError(`Period ${period.year}-${period.month} is not closed`);
  }

  const reopened = { status: "open" as const, closedAt: null, closedBy: null };

  await db.writeBatch([
    statement(db.query.update(accountingPeriod).set(reopened).where(eq(accountingPeriod.id, periodId))),
    auditStatement(db, reopenedBy, "period.reopen", "accounting_period", periodId, period, {
      ...period,
      ...reopened,
      reason,
    }),
  ]);

  return readPeriod(db, periodId);
}
