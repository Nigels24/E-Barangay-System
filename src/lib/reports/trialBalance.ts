/**
 * Trial Balance, computed from the ledger — never from a stored copy, so it
 * can never disagree with the General Ledger (see docs/decisions.md D18 and
 * the plan's reports section). Only posted entries count; drafts and
 * voided entries never touch a report.
 *
 * The client's own trial balance is MONTHLY and CUMULATIVE (Finding C in
 * the plan): one report per month, each totalling everything from
 * inception through the last day of that month, not just that month's
 * activity. `year`/`month` here select which "as of" date to report as of
 * — matching the client's own "MONTH / YEAR — FOR PRINT" workflow.
 */
import { and, eq, lte } from "drizzle-orm";
import { account, journalEntry, journalEntryLine } from "../../db/schema";
import type { EngineDb } from "../engine/types";
import { sumCentavos } from "../money";

export interface TrialBalanceRow {
  accountId: number;
  code: string;
  name: string;
  debitCentavos: number;
  creditCentavos: number;
}

export interface TrialBalanceResult {
  asOfDate: string;
  rows: TrialBalanceRow[];
  totalDebitCentavos: number;
  totalCreditCentavos: number;
}

/** Last calendar day of the given month, as an ISO date string. */
export function lastDayOfMonth(year: number, month: number): string {
  const d = new Date(year, month, 0); // day 0 of the next month = last day of this one
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export async function buildTrialBalance(
  db: EngineDb,
  barangayId: number,
  year: number,
  month: number,
): Promise<TrialBalanceResult> {
  const asOfDate = lastDayOfMonth(year, month);

  const lines = await db.query
    .select({
      accountId: journalEntryLine.accountId,
      debitCentavos: journalEntryLine.debitCentavos,
      creditCentavos: journalEntryLine.creditCentavos,
      code: account.code,
      name: account.name,
    })
    .from(journalEntryLine)
    .innerJoin(journalEntry, eq(journalEntryLine.entryId, journalEntry.id))
    .innerJoin(account, eq(journalEntryLine.accountId, account.id))
    .where(
      and(
        eq(journalEntry.barangayId, barangayId),
        eq(journalEntry.status, "posted"),
        lte(journalEntry.entryDate, asOfDate),
      ),
    )
    .all();

  const byAccount = new Map<number, TrialBalanceRow>();
  for (const line of lines) {
    const existing =
      byAccount.get(line.accountId) ??
      ({ accountId: line.accountId, code: line.code, name: line.name, debitCentavos: 0, creditCentavos: 0 } satisfies TrialBalanceRow);
    existing.debitCentavos += line.debitCentavos;
    existing.creditCentavos += line.creditCentavos;
    byAccount.set(line.accountId, existing);
  }

  // A trial balance shows each account's NET balance (gross debit turnover
  // less gross credit turnover, or vice versa) — never both columns filled
  // for the same account.
  const rows = [...byAccount.values()]
    .map((r) => {
      const net = r.debitCentavos - r.creditCentavos;
      return net >= 0
        ? { ...r, debitCentavos: net, creditCentavos: 0 }
        : { ...r, debitCentavos: 0, creditCentavos: -net };
    })
    .filter((r) => r.debitCentavos !== 0 || r.creditCentavos !== 0)
    .sort((a, b) => a.code.localeCompare(b.code));

  return {
    asOfDate,
    rows,
    totalDebitCentavos: sumCentavos(rows.map((r) => r.debitCentavos)),
    totalCreditCentavos: sumCentavos(rows.map((r) => r.creditCentavos)),
  };
}
