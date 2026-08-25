/**
 * Bank Reconciliation Statement — every bank account a barangay has on file
 * (D2), and that period's worksheet for each, if one has been started.
 *
 * Like the Fixed Asset schedule and the Schedule of Advances, this is NOT
 * read from `journal_entry_line` directly for its own numbers — the
 * worksheet (`bank_reconciliation`/`reconciling_item`) is its own record,
 * reconciled against the ledger rather than derived from it (D5's whole
 * premise: a reconciliation never posts, so it can never just be replayed
 * from posted lines the way a Trial Balance can). The one figure this DOES
 * pull live from the ledger is the book balance — see
 * `queries/bankReconciliation.ts`'s `getReconciliationWorksheet` for why it
 * is always recomputed rather than trusted from the stored column.
 *
 * A bank account with no reconciliation yet this period still appears, with
 * `reconciliation: null` — silently omitting it would make an unreconciled
 * account look like it does not exist rather than like unfinished work.
 */
import { and, asc, eq } from "drizzle-orm";
import {
  account,
  accountingPeriod,
  bankAccount,
  bankReconciliation,
  reconcilingItem,
  type ReconciliationStatus,
  type ReconcilingItemType,
  type ReconcilingSide,
} from "../../db/schema";
import { periodEndDate } from "../calendar";
import type { EngineDb } from "../engine/types";
import { sumCentavos } from "../money";
import { buildGeneralLedger } from "./generalLedger";

export interface BankReconciliationLineItem {
  id: number;
  side: ReconcilingSide;
  itemType: ReconcilingItemType;
  amountCentavos: number;
  explanation: string | null;
  adjustingEntryId: number | null;
}

export interface BankAccountStatement {
  bankAccountId: number;
  bankName: string;
  accountNo: string;
  accountName: string;
  glAccountCode: string;
  glAccountName: string;
  reconciliation: {
    statementDate: string;
    statementBalanceCentavos: number;
    bookBalanceCentavos: number;
    status: ReconciliationStatus;
    finalisedAt: string | null;
    varianceOverrideReason: string | null;
  } | null;
  items: BankReconciliationLineItem[];
  /** `null` when `reconciliation` is `null` — there is nothing to adjust yet. */
  adjustedBankBalanceCentavos: number | null;
  adjustedBookBalanceCentavos: number | null;
  varianceCentavos: number | null;
}

export interface BankReconciliationStatementResult {
  asOfDate: string;
  accounts: BankAccountStatement[];
}

export async function buildBankReconciliationStatement(
  db: EngineDb,
  barangayId: number,
  year: number,
  month: number,
): Promise<BankReconciliationStatementResult> {
  const asOfDate = periodEndDate(year, month);

  const period = await db.query
    .select({ id: accountingPeriod.id })
    .from(accountingPeriod)
    .where(and(eq(accountingPeriod.barangayId, barangayId), eq(accountingPeriod.year, year), eq(accountingPeriod.month, month)))
    .get();

  const accounts = await db.query
    .select({
      bankAccountId: bankAccount.id,
      bankName: bankAccount.bankName,
      accountNo: bankAccount.accountNo,
      accountName: bankAccount.accountName,
      glAccountId: bankAccount.glAccountId,
      glAccountCode: account.code,
      glAccountName: account.name,
    })
    .from(bankAccount)
    .innerJoin(account, eq(bankAccount.glAccountId, account.id))
    .where(eq(bankAccount.barangayId, barangayId))
    .orderBy(asc(bankAccount.bankName), asc(bankAccount.accountNo))
    .all();

  const statements: BankAccountStatement[] = [];
  for (const acct of accounts) {
    const reconciliation = period
      ? await db.query
          .select()
          .from(bankReconciliation)
          .where(and(eq(bankReconciliation.bankAccountId, acct.bankAccountId), eq(bankReconciliation.periodId, period.id)))
          .get()
      : undefined;

    const ledger = await buildGeneralLedger(db, barangayId, acct.glAccountId, year, month);
    const liveBookBalanceCentavos = ledger.closingBalanceCentavos;

    const items = reconciliation
      ? await db.query
          .select()
          .from(reconcilingItem)
          .where(eq(reconcilingItem.reconciliationId, reconciliation.id))
          .orderBy(asc(reconcilingItem.id))
          .all()
      : [];

    const bankItemsTotal = sumCentavos(items.filter((i) => i.side === "bank").map((i) => i.amountCentavos));
    // Same reasoning as `getReconciliationWorksheet`: once a book-side item's
    // adjusting entry has posted, its effect already lives in the live ledger
    // balance, so it must drop out of the pending-adjustment sum or it would
    // be counted twice.
    const bookItemsTotal = sumCentavos(
      items.filter((i) => i.side === "book" && i.adjustingEntryId === null).map((i) => i.amountCentavos),
    );

    const adjustedBankBalanceCentavos = reconciliation ? reconciliation.statementBalanceCentavos + bankItemsTotal : null;
    const adjustedBookBalanceCentavos = reconciliation ? liveBookBalanceCentavos + bookItemsTotal : null;

    statements.push({
      bankAccountId: acct.bankAccountId,
      bankName: acct.bankName,
      accountNo: acct.accountNo,
      accountName: acct.accountName,
      glAccountCode: acct.glAccountCode,
      glAccountName: acct.glAccountName,
      reconciliation: reconciliation
        ? {
            statementDate: reconciliation.statementDate,
            statementBalanceCentavos: reconciliation.statementBalanceCentavos,
            bookBalanceCentavos: liveBookBalanceCentavos,
            status: reconciliation.status,
            finalisedAt: reconciliation.finalisedAt,
            varianceOverrideReason: reconciliation.varianceOverrideReason,
          }
        : null,
      items: items.map((i) => ({
        id: i.id,
        side: i.side,
        itemType: i.itemType,
        amountCentavos: i.amountCentavos,
        explanation: i.explanation,
        adjustingEntryId: i.adjustingEntryId,
      })),
      adjustedBankBalanceCentavos,
      adjustedBookBalanceCentavos,
      varianceCentavos:
        adjustedBankBalanceCentavos !== null && adjustedBookBalanceCentavos !== null
          ? adjustedBankBalanceCentavos - adjustedBookBalanceCentavos
          : null,
    });
  }

  return { asOfDate, accounts: statements };
}
