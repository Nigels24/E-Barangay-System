/**
 * Opening a period from a screen, and summarising what is in it.
 *
 * The write itself is not reimplemented here — `ensurePeriod()` in
 * `src/lib/engine/period.ts` owns that, including the audit-trail rules around
 * closing and reopening. This module is the seam between a picker's three
 * string values and that engine call: it validates them, calls the engine, and
 * returns a flat shape a screen can render without knowing any Drizzle.
 *
 * Same reasoning as `barangays.ts` — logic that lives here is under vitest,
 * logic that lives in a component is not.
 */
import { count, eq } from "drizzle-orm";
import { journalEntry, type PeriodStatus } from "../../db/schema";
import { closePeriod, ensurePeriod, reopenPeriod } from "../engine/period";
import type { EngineDb } from "../engine/types";

/** A period plus the one number a picker screen shows about it. */
export interface PeriodSummary {
  periodId: number;
  barangayId: number;
  year: number;
  month: number;
  status: PeriodStatus;
  /**
   * Every journal entry filed under this period — drafts, posted and voided
   * alike. It answers "is there anything in this month's books", so an entry
   * that exists but was voided still counts as something being there.
   */
  entryCount: number;
}

/** Thrown when a screen asks for a period that could not exist. */
export class InvalidPeriodSelectionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPeriodSelectionError";
  }
}

/**
 * Mirrors `accounting_period`'s own CHECK constraints, deliberately — not the
 * narrower range the picker happens to offer.
 *
 * Without this a mis-parsed select value reaches SQLite and comes back as
 * "CHECK constraint failed: period_month_valid", which is a fine message for a
 * developer and useless to a bookkeeper. The database still has the final say;
 * this just gets there first with something readable.
 */
function assertSelection(barangayId: number, year: number, month: number): void {
  if (!Number.isInteger(barangayId) || barangayId <= 0) {
    throw new InvalidPeriodSelectionError(`No barangay chosen (got ${barangayId}).`);
  }
  if (!Number.isInteger(year) || year < 1900 || year > 2200) {
    throw new InvalidPeriodSelectionError(`${year} is not a usable accounting year.`);
  }
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new InvalidPeriodSelectionError(`${month} is not a month between 1 and 12.`);
  }
}

/** How many journal entries are filed under a period. */
export async function countPeriodEntries(db: EngineDb, periodId: number): Promise<number> {
  const row = await db.query
    .select({ entries: count() })
    .from(journalEntry)
    .where(eq(journalEntry.periodId, periodId))
    .get();
  return row?.entries ?? 0;
}

/** A period row plus its entry count, in the shape a screen renders. */
async function toSummary(
  db: EngineDb,
  period: { id: number; barangayId: number; year: number; month: number; status: PeriodStatus },
): Promise<PeriodSummary> {
  return {
    periodId: period.id,
    barangayId: period.barangayId,
    year: period.year,
    month: period.month,
    status: period.status,
    entryCount: await countPeriodEntries(db, period.id),
  };
}

/**
 * Opens the period for (barangay, year, month) if it isn't open already, and
 * returns it with its entry count.
 *
 * "Opens" is `ensurePeriod`'s meaning of the word: an existing period — open or
 * closed — is returned untouched, and only a period that has never existed is
 * created. Choosing a month in the picker therefore never reopens a period
 * someone deliberately closed. Reopening needs an administrator and a written
 * reason (D22) and is not this screen's job.
 */
export async function openPeriodSummary(
  db: EngineDb,
  barangayId: number,
  year: number,
  month: number,
): Promise<PeriodSummary> {
  assertSelection(barangayId, year, month);

  const period = await ensurePeriod(db, barangayId, year, month);
  return toSummary(db, period);
}

/**
 * Closes an open period from a screen. `actorUserId` is the current
 * session's user (T-018/D24) — the screen already knows who is working,
 * from the who's-working picker in `App.tsx`.
 */
export async function closePeriodAction(db: EngineDb, periodId: number, actorUserId: number): Promise<PeriodSummary> {
  const period = await closePeriod(db, periodId, actorUserId);
  return toSummary(db, period);
}

/**
 * Reopens a closed period given a written reason (D22). `reopenPeriod` itself
 * is what refuses a blank reason — this wrapper adds nothing but the actor and
 * the refreshed summary a screen needs to re-render.
 */
export async function reopenPeriodAction(
  db: EngineDb,
  periodId: number,
  reason: string,
  actorUserId: number,
): Promise<PeriodSummary> {
  const period = await reopenPeriod(db, periodId, actorUserId, reason);
  return toSummary(db, period);
}
