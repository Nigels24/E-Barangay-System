/**
 * Schedule of Advances to Officers and Employees — the register
 * `advance_to_officer` holds, as of a report date.
 *
 * Like the Fixed Asset schedule (D21's reasoning), this is NOT read from
 * `journal_entry_line` — it is the officer-level subsidiary detail behind
 * whichever ledger account carries the aggregate "Advances to Officers and
 * Employees" balance, built and kept independently of the ledger.
 *
 * `advance_to_officer` has no liquidation-date column — only a running
 * `liquidatedCentavos` total and a `status` that says outstanding or
 * liquidated as of *now*. Unlike a fixed asset's `disposalDate`, there is no
 * way to ask what an advance's status would have been exactly as of a past
 * date. What this report can say precisely, from the schema as it stands, is:
 * advances granted on or before the report's period end that are *currently*
 * still outstanding. That is exact for the common case — a report run for
 * the barangay's current period — and is a known scope limit if this report
 * is ever re-run for a past month after a liquidation has since happened.
 * See SYSTEM_FLOW.md.
 */
import { and, eq, lte } from "drizzle-orm";
import { advanceToOfficer } from "../../db/schema";
import { periodEndDate } from "../calendar";
import type { EngineDb } from "../engine/types";
import { sumCentavos } from "../money";

export interface ScheduleOfAdvancesRow {
  advanceId: number;
  dateGranted: string;
  payee: string;
  particulars: string;
  amountCentavos: number;
  liquidatedCentavos: number;
  balanceCentavos: number;
}

export interface ScheduleOfAdvancesResult {
  asOfDate: string;
  rows: ScheduleOfAdvancesRow[];
  totalAmountCentavos: number;
  totalLiquidatedCentavos: number;
  totalBalanceCentavos: number;
}

export async function buildScheduleOfAdvances(
  db: EngineDb,
  barangayId: number,
  year: number,
  month: number,
): Promise<ScheduleOfAdvancesResult> {
  const asOfDate = periodEndDate(year, month);

  const advances = await db.query
    .select()
    .from(advanceToOfficer)
    .where(
      and(
        eq(advanceToOfficer.barangayId, barangayId),
        eq(advanceToOfficer.status, "outstanding"),
        lte(advanceToOfficer.dateGranted, asOfDate),
      ),
    )
    .all();

  const rows: ScheduleOfAdvancesRow[] = advances
    .map((a) => ({
      advanceId: a.id,
      dateGranted: a.dateGranted,
      payee: a.payee,
      particulars: a.particulars,
      amountCentavos: a.amountCentavos,
      liquidatedCentavos: a.liquidatedCentavos,
      balanceCentavos: a.amountCentavos - a.liquidatedCentavos,
    }))
    .sort((x, y) => x.dateGranted.localeCompare(y.dateGranted) || x.advanceId - y.advanceId);

  return {
    asOfDate,
    rows,
    totalAmountCentavos: sumCentavos(rows.map((r) => r.amountCentavos)),
    totalLiquidatedCentavos: sumCentavos(rows.map((r) => r.liquidatedCentavos)),
    totalBalanceCentavos: sumCentavos(rows.map((r) => r.balanceCentavos)),
  };
}
