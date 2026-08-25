/**
 * General Journal — every posted GJ-book entry for the period, in
 * chronological order, each with its full set of debit/credit lines.
 *
 * Unlike the Trial Balance (cumulative through a date), a journal is a
 * record of THIS period's activity only, matching the client's own monthly
 * journal pages. Scoped to book = 'GJ' — the client keeps the other three
 * books (CRJ, CkDJ, CDJ) separately; this is the general journal, not a
 * combined register of all four.
 *
 * Computed straight from journal_entry / journal_entry_line (D18): never a
 * stored copy, so it can never disagree with the Trial Balance or General
 * Ledger over the same postings.
 */
import { and, asc, eq, gte, lte } from "drizzle-orm";
import { account, journalEntry, journalEntryLine } from "../../db/schema";
import { periodEndDate, periodStartDate } from "../calendar";
import type { EngineDb } from "../engine/types";
import { sumCentavos } from "../money";

export interface GeneralJournalLine {
  lineNo: number;
  accountCode: string;
  accountName: string;
  debitCentavos: number;
  creditCentavos: number;
  memo: string | null;
}

export interface GeneralJournalEntry {
  entryId: number;
  entryDate: string;
  jevNo: string | null;
  particulars: string;
  lines: GeneralJournalLine[];
}

export interface GeneralJournalResult {
  year: number;
  month: number;
  entries: GeneralJournalEntry[];
  totalDebitCentavos: number;
  totalCreditCentavos: number;
}

export async function buildGeneralJournal(
  db: EngineDb,
  barangayId: number,
  year: number,
  month: number,
): Promise<GeneralJournalResult> {
  const startDate = periodStartDate(year, month);
  const endDate = periodEndDate(year, month);

  const rows = await db.query
    .select({
      entryId: journalEntry.id,
      entryDate: journalEntry.entryDate,
      jevNo: journalEntry.jevNo,
      particulars: journalEntry.particulars,
      lineNo: journalEntryLine.lineNo,
      debitCentavos: journalEntryLine.debitCentavos,
      creditCentavos: journalEntryLine.creditCentavos,
      memo: journalEntryLine.memo,
      accountCode: account.code,
      accountName: account.name,
    })
    .from(journalEntryLine)
    .innerJoin(journalEntry, eq(journalEntryLine.entryId, journalEntry.id))
    .innerJoin(account, eq(journalEntryLine.accountId, account.id))
    .where(
      and(
        eq(journalEntry.barangayId, barangayId),
        eq(journalEntry.book, "GJ"),
        eq(journalEntry.status, "posted"),
        gte(journalEntry.entryDate, startDate),
        lte(journalEntry.entryDate, endDate),
      ),
    )
    .orderBy(asc(journalEntry.entryDate), asc(journalEntry.id), asc(journalEntryLine.lineNo))
    .all();

  const byEntry = new Map<number, GeneralJournalEntry>();
  for (const row of rows) {
    let entry = byEntry.get(row.entryId);
    if (!entry) {
      entry = {
        entryId: row.entryId,
        entryDate: row.entryDate,
        jevNo: row.jevNo,
        particulars: row.particulars,
        lines: [],
      };
      byEntry.set(row.entryId, entry);
    }
    entry.lines.push({
      lineNo: row.lineNo,
      accountCode: row.accountCode,
      accountName: row.accountName,
      debitCentavos: row.debitCentavos,
      creditCentavos: row.creditCentavos,
      memo: row.memo,
    });
  }

  return {
    year,
    month,
    entries: [...byEntry.values()], // insertion order follows the query's own ORDER BY
    totalDebitCentavos: sumCentavos(rows.map((r) => r.debitCentavos)),
    totalCreditCentavos: sumCentavos(rows.map((r) => r.creditCentavos)),
  };
}
