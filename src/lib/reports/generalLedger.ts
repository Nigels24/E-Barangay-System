/**
 * General Ledger for a single account — every posted line affecting it,
 * in date order, with a running balance. Same source of truth as the
 * Trial Balance (posted journal_entry_line rows): the two can never
 * disagree, because neither one is a stored copy of the other.
 */
import { and, asc, eq, lte } from "drizzle-orm";
import { journalEntry, journalEntryLine } from "../../db/schema";
import type { EngineDb } from "../engine/types";
import { lastDayOfMonth } from "./trialBalance";

export interface LedgerRow {
  entryId: number;
  entryDate: string;
  particulars: string;
  jevNo: string | null;
  debitCentavos: number;
  creditCentavos: number;
  balanceCentavos: number;
}

export interface GeneralLedgerResult {
  accountId: number;
  asOfDate: string;
  rows: LedgerRow[];
  closingBalanceCentavos: number;
}

export async function buildGeneralLedger(
  db: EngineDb,
  barangayId: number,
  accountId: number,
  year: number,
  month: number,
): Promise<GeneralLedgerResult> {
  const asOfDate = lastDayOfMonth(year, month);

  const lines = await db.query
    .select({
      entryId: journalEntry.id,
      entryDate: journalEntry.entryDate,
      particulars: journalEntry.particulars,
      jevNo: journalEntry.jevNo,
      lineNo: journalEntryLine.lineNo,
      debitCentavos: journalEntryLine.debitCentavos,
      creditCentavos: journalEntryLine.creditCentavos,
    })
    .from(journalEntryLine)
    .innerJoin(journalEntry, eq(journalEntryLine.entryId, journalEntry.id))
    .where(
      and(
        eq(journalEntry.barangayId, barangayId),
        eq(journalEntryLine.accountId, accountId),
        eq(journalEntry.status, "posted"),
        lte(journalEntry.entryDate, asOfDate),
      ),
    )
    .orderBy(asc(journalEntry.entryDate), asc(journalEntry.id), asc(journalEntryLine.lineNo))
    .all();

  let running = 0;
  const rows: LedgerRow[] = lines.map((l) => {
    running += l.debitCentavos - l.creditCentavos;
    return {
      entryId: l.entryId,
      entryDate: l.entryDate,
      particulars: l.particulars,
      jevNo: l.jevNo,
      debitCentavos: l.debitCentavos,
      creditCentavos: l.creditCentavos,
      balanceCentavos: running,
    };
  });

  return { accountId, asOfDate, rows, closingBalanceCentavos: running };
}
