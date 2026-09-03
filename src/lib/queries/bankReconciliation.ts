/**
 * Bank reconciliation, as a screen needs it: bank accounts, a period's
 * worksheet, and every action the composer screen can take. Same seam
 * pattern as `queries/fixedAssets.ts`/`queries/advances.ts` — the engine
 * (`engine/bankReconciliation.ts`) owns each write and its audit trail;
 * this module resolves the actor, recomputes the live ledger figures the
 * worksheet needs, and shapes everything for the screen.
 *
 * **The assisted "Create adjusting entry" flow (D5) lives here, not in a
 * new engine function.** `postAdjustingEntryAction` below is a two-line
 * voucher built from a book-side item's own signed amount, posted through
 * the *exact same* `postNewVoucher` every ordinary voucher goes through
 * (`queries/journal.ts`) — full balance validation, period-open check,
 * audit trail, all of it, for free. Only after that real posting succeeds
 * does `linkAdjustingEntry` record which voucher it turned out to be. If
 * posting fails, nothing is linked and the item stays exactly as
 * unaddressed as it was before — there is no "half adjusted" state.
 */
import { and, asc, eq, like } from "drizzle-orm";
import {
  account,
  bankAccount,
  bankReconciliation,
  journalEntry,
  journalEntryLine,
  reconcilingItem,
  type ReconciliationStatus,
  type ReconcilingItemType,
  type ReconcilingSide,
} from "../../db/schema";
import {
  addReconcilingItem,
  createBankAccount,
  finalizeReconciliation,
  linkAdjustingEntry,
  markCheckCleared,
  startReconciliation,
  updateReconciliationHeader,
} from "../engine/bankReconciliation";
import type { EngineDb } from "../engine/types";
import { buildGeneralLedger } from "../reports/generalLedger";
import { sumCentavos } from "../money";
import { postNewVoucher, type PostedVoucher } from "./journal";

/* ------------------------------------------------------------------ */
/* Bank accounts                                                        */
/* ------------------------------------------------------------------ */

export interface BankAccountRecord {
  id: number;
  barangayId: number;
  bankName: string;
  accountNo: string;
  accountName: string;
  glAccountId: number;
  glAccountCode: string;
  glAccountName: string;
  isActive: boolean;
}

const bankAccountSelection = {
  id: bankAccount.id,
  barangayId: bankAccount.barangayId,
  bankName: bankAccount.bankName,
  accountNo: bankAccount.accountNo,
  accountName: bankAccount.accountName,
  glAccountId: bankAccount.glAccountId,
  glAccountCode: account.code,
  glAccountName: account.name,
  isActive: bankAccount.isActive,
} as const;

/** Every bank account a barangay has on file (D2), active or not, bank name first. */
export async function listBankAccounts(db: EngineDb, barangayId: number): Promise<BankAccountRecord[]> {
  return db.query
    .select(bankAccountSelection)
    .from(bankAccount)
    .innerJoin(account, eq(bankAccount.glAccountId, account.id))
    .where(eq(bankAccount.barangayId, barangayId))
    .orderBy(asc(bankAccount.bankName), asc(bankAccount.accountNo))
    .all();
}

/**
 * The Cash in Bank accounts (`1-01-02-`) a bank account may be controlled
 * by — the Revised Chart of Accounts' own subgroup for bank cash, the same
 * kind of real prefix filter `listFixedAssetAccounts` uses for PPE.
 */
export async function listBankGlAccounts(db: EngineDb) {
  return db.query
    .select({ id: account.id, code: account.code, name: account.name, isProvisionalCode: account.isProvisionalCode })
    .from(account)
    .where(and(eq(account.isActive, true), eq(account.isPostable, true), like(account.code, "1-01-02-%")))
    .orderBy(asc(account.code))
    .all();
}

export interface NewBankAccountInput {
  barangayId: number;
  bankName: string;
  accountNo: string;
  accountName: string;
  glAccountId: number;
}

/** Adds a bank account. `actorUserId` is the current session's user (T-018/D24). */
export async function createBankAccountAction(
  db: EngineDb,
  input: NewBankAccountInput,
  actorUserId: number,
): Promise<BankAccountRecord> {
  const created = await createBankAccount(db, { ...input, recordedBy: actorUserId });
  const row = await db.query
    .select(bankAccountSelection)
    .from(bankAccount)
    .innerJoin(account, eq(bankAccount.glAccountId, account.id))
    .where(eq(bankAccount.id, created.id))
    .get();
  if (!row) throw new Error(`Bank account ${created.id} disappeared after being created`);
  return row;
}

/* ------------------------------------------------------------------ */
/* The worksheet                                                        */
/* ------------------------------------------------------------------ */

/**
 * Everything the worksheet needs to compute against: which bank account and
 * period, and — since the worksheet always reads the *live* ledger balance,
 * never a stale stored one (see {@link getReconciliationWorksheet}) — the
 * ledger account and the period's year/month `buildGeneralLedger` needs to
 * compute it fresh.
 */
export interface WorksheetContext {
  bankAccountId: number;
  periodId: number;
  barangayId: number;
  glAccountId: number;
  year: number;
  month: number;
}

export interface ReconciliationRecord {
  id: number;
  bankAccountId: number;
  periodId: number;
  statementDate: string;
  statementBalanceCentavos: number;
  bookBalanceCentavos: number;
  status: ReconciliationStatus;
  finalisedAt: string | null;
  varianceOverrideReason: string | null;
}

export interface ReconcilingItemRecord {
  id: number;
  reconciliationId: number;
  side: ReconcilingSide;
  itemType: ReconcilingItemType;
  amountCentavos: number;
  explanation: string | null;
  relatedEntryId: number | null;
  adjustingEntryId: number | null;
}

export interface ReconciliationWorksheet {
  reconciliation: ReconciliationRecord;
  items: ReconcilingItemRecord[];
  /** Cash in Bank's ledger balance right now — recomputed on every read, never the possibly-stale stored column (see module doc). */
  liveBookBalanceCentavos: number;
  adjustedBankBalanceCentavos: number;
  adjustedBookBalanceCentavos: number;
  /** Zero means reconciled. Never blocks saving a draft (D7) — only finalizing. */
  varianceCentavos: number;
}

/**
 * Reads a period's reconciliation for a bank account, or `null` if the
 * bookkeeper has not started one yet.
 *
 * **Why the book balance is always recomputed, never read from the stored
 * column:** `bank_reconciliation.book_balance_centavos` is a snapshot,
 * frozen at the moment the worksheet was started or finalised (schema.ts:
 * "captured when finalised"). Between those two moments the bookkeeper can
 * keep posting ordinary vouchers into the same open period, which would
 * make a *stored* balance stale mid-worksheet. Reading it live here means
 * the variance the bookkeeper sees, and the one `finalizeReconciliationAction`
 * gates on, can never disagree with what the ledger actually says right now.
 */
export async function getReconciliationWorksheet(
  db: EngineDb,
  context: WorksheetContext,
): Promise<ReconciliationWorksheet | null> {
  const reconciliation = await db.query
    .select()
    .from(bankReconciliation)
    .where(
      and(eq(bankReconciliation.bankAccountId, context.bankAccountId), eq(bankReconciliation.periodId, context.periodId)),
    )
    .get();
  if (!reconciliation) return null;

  const items = await db.query
    .select()
    .from(reconcilingItem)
    .where(eq(reconcilingItem.reconciliationId, reconciliation.id))
    .orderBy(asc(reconcilingItem.id))
    .all();

  const ledger = await buildGeneralLedger(db, context.barangayId, context.glAccountId, context.year, context.month);
  const liveBookBalanceCentavos = ledger.closingBalanceCentavos;

  const bankItemsTotal = sumCentavos(items.filter((i) => i.side === "bank").map((i) => i.amountCentavos));
  // A book-side item whose adjusting entry has already posted is no longer a
  // *pending* difference — its effect already lives in `liveBookBalanceCentavos`
  // itself. Summing it again here would double-count it once posted.
  const bookItemsTotal = sumCentavos(
    items.filter((i) => i.side === "book" && i.adjustingEntryId === null).map((i) => i.amountCentavos),
  );

  const adjustedBankBalanceCentavos = reconciliation.statementBalanceCentavos + bankItemsTotal;
  const adjustedBookBalanceCentavos = liveBookBalanceCentavos + bookItemsTotal;

  return {
    reconciliation,
    items,
    liveBookBalanceCentavos,
    adjustedBankBalanceCentavos,
    adjustedBookBalanceCentavos,
    varianceCentavos: adjustedBankBalanceCentavos - adjustedBookBalanceCentavos,
  };
}

async function reloadWorksheet(db: EngineDb, context: WorksheetContext): Promise<ReconciliationWorksheet> {
  const worksheet = await getReconciliationWorksheet(db, context);
  if (!worksheet) throw new Error("The reconciliation could not be read back after being written to");
  return worksheet;
}

export interface StartReconciliationActionInput {
  context: WorksheetContext;
  statementDate: string;
  statementBalanceCentavos: number;
}

/** Starts this period's reconciliation. `actorUserId` is the current session's user (T-018/D24). */
export async function startReconciliationAction(
  db: EngineDb,
  input: StartReconciliationActionInput,
  actorUserId: number,
): Promise<ReconciliationWorksheet> {
  const ledger = await buildGeneralLedger(
    db,
    input.context.barangayId,
    input.context.glAccountId,
    input.context.year,
    input.context.month,
  );
  await startReconciliation(db, {
    bankAccountId: input.context.bankAccountId,
    periodId: input.context.periodId,
    statementDate: input.statementDate,
    statementBalanceCentavos: input.statementBalanceCentavos,
    bookBalanceCentavos: ledger.closingBalanceCentavos,
    preparedBy: actorUserId,
  });
  return reloadWorksheet(db, input.context);
}

export interface UpdateReconciliationHeaderActionInput {
  context: WorksheetContext;
  reconciliationId: number;
  statementDate: string;
  statementBalanceCentavos: number;
}

/** Corrects the statement date/balance while still a draft (D3). `actorUserId` is the current session's user (T-018/D24). */
export async function updateReconciliationHeaderAction(
  db: EngineDb,
  input: UpdateReconciliationHeaderActionInput,
  actorUserId: number,
): Promise<ReconciliationWorksheet> {
  await updateReconciliationHeader(db, {
    reconciliationId: input.reconciliationId,
    statementDate: input.statementDate,
    statementBalanceCentavos: input.statementBalanceCentavos,
    updatedBy: actorUserId,
  });
  return reloadWorksheet(db, input.context);
}

export interface AddReconcilingItemActionInput {
  context: WorksheetContext;
  reconciliationId: number;
  side: ReconcilingSide;
  itemType: ReconcilingItemType;
  amountCentavos: number;
  explanation?: string;
  relatedEntryId?: number;
}

/** Adds a reconciling item (D4). `actorUserId` is the current session's user (T-018/D24). */
export async function addReconcilingItemAction(
  db: EngineDb,
  input: AddReconcilingItemActionInput,
  actorUserId: number,
): Promise<ReconciliationWorksheet> {
  await addReconcilingItem(db, {
    reconciliationId: input.reconciliationId,
    side: input.side,
    itemType: input.itemType,
    amountCentavos: input.amountCentavos,
    explanation: input.explanation,
    relatedEntryId: input.relatedEntryId,
    recordedBy: actorUserId,
  });
  return reloadWorksheet(db, input.context);
}

export interface FinalizeReconciliationActionInput {
  context: WorksheetContext;
  reconciliationId: number;
  varianceOverrideReason?: string;
}

/**
 * Finalizes the reconciliation (D7), using the worksheet's own live figures
 * for the variance gate — read fresh right before writing, so a voucher
 * posted moments earlier can never be missed.
 */
export async function finalizeReconciliationAction(
  db: EngineDb,
  input: FinalizeReconciliationActionInput,
  actorUserId: number,
): Promise<ReconciliationWorksheet> {
  const worksheet = await reloadWorksheet(db, input.context);
  await finalizeReconciliation(db, {
    reconciliationId: input.reconciliationId,
    currentBookBalanceCentavos: worksheet.liveBookBalanceCentavos,
    varianceCentavos: worksheet.varianceCentavos,
    varianceOverrideReason: input.varianceOverrideReason,
    finalizedBy: actorUserId,
  });
  return reloadWorksheet(db, input.context);
}

/* ------------------------------------------------------------------ */
/* Outstanding checks (D6)                                              */
/* ------------------------------------------------------------------ */

export interface OutstandingCheckCandidate {
  entryId: number;
  jevNo: string | null;
  checkNo: string;
  checkDate: string;
  /** The check's own amount against Cash in Bank. */
  amountCentavos: number;
}

/**
 * Posted check disbursements against this bank account's own Cash in Bank
 * account that have not cleared as of `asOfDate`, and are not already
 * spoken for by a reconciling item in any period — derived, never retyped
 * (D6).
 *
 * Matched by the bank account's linked GL account rather than
 * `journal_entry.bank_account_id` (which nothing in the voucher composer
 * sets yet — a barangay's Cash in Bank account maps one-to-one to one bank
 * account today, which is the case this covers exactly). That column
 * remains for the day two physical accounts ever need to share one control
 * account.
 */
export async function deriveOutstandingChecks(
  db: EngineDb,
  barangayId: number,
  glAccountId: number,
  asOfDate: string,
): Promise<OutstandingCheckCandidate[]> {
  const rows = await db.query
    .select({
      entryId: journalEntry.id,
      jevNo: journalEntry.jevNo,
      checkNo: journalEntry.checkNo,
      checkDate: journalEntry.checkDate,
      clearedDate: journalEntry.clearedDate,
      amountCentavos: journalEntryLine.creditCentavos,
    })
    .from(journalEntry)
    .innerJoin(journalEntryLine, eq(journalEntryLine.entryId, journalEntry.id))
    .where(
      and(
        eq(journalEntry.barangayId, barangayId),
        eq(journalEntry.book, "CkDJ"),
        eq(journalEntry.status, "posted"),
        eq(journalEntryLine.accountId, glAccountId),
      ),
    )
    .all();

  const related = await db.query.select({ relatedEntryId: reconcilingItem.relatedEntryId }).from(reconcilingItem).all();
  const alreadyRelated = new Set(related.map((r) => r.relatedEntryId).filter((id): id is number => id !== null));

  return rows
    .filter(
      (r) =>
        r.checkNo !== null &&
        r.checkDate !== null &&
        r.checkDate <= asOfDate &&
        (r.clearedDate === null || r.clearedDate > asOfDate) &&
        !alreadyRelated.has(r.entryId),
    )
    .map((r) => ({
      entryId: r.entryId,
      jevNo: r.jevNo,
      checkNo: r.checkNo as string,
      checkDate: r.checkDate as string,
      amountCentavos: r.amountCentavos,
    }))
    .sort((a, b) => a.checkDate.localeCompare(b.checkDate) || a.entryId - b.entryId);
}

export interface MarkCheckClearedActionInput {
  entryId: number;
  clearedDate: string;
}

/** Marks a check cleared, once it appears on a bank statement (D6). `actorUserId` is the current session's user (T-018/D24). */
export async function markCheckClearedAction(db: EngineDb, input: MarkCheckClearedActionInput, actorUserId: number) {
  return markCheckCleared(db, { entryId: input.entryId, clearedDate: input.clearedDate, clearedBy: actorUserId });
}

/* ------------------------------------------------------------------ */
/* The assisted "Create adjusting entry" flow (D5)                      */
/* ------------------------------------------------------------------ */

export interface PostAdjustingEntryActionInput {
  context: WorksheetContext;
  reconcilingItemId: number;
  /** The item's own signed amount — its sign decides which side Cash in Bank lands on. */
  itemAmountCentavos: number;
  entryDate: string;
  particulars: string;
  offsetAccountId: number;
}

/**
 * Posts the adjusting voucher a book-side item calls for, then links it to
 * that item (D5). This is not a new posting path: it builds two lines from
 * the item's own signed amount and hands them to the exact same
 * `postNewVoucher` every ordinary voucher goes through — full balance
 * validation, period-open check, its own audit trail. Only once that
 * succeeds does the item get linked. A positive item amount means the book
 * balance should rise (money genuinely came in — Cash in Bank is debited,
 * the chosen offset account credited); negative means it should fall (Cash
 * in Bank credited, the offset account debited) — ordinary double-entry,
 * not a guess.
 */
export async function postAdjustingEntryAction(
  db: EngineDb,
  input: PostAdjustingEntryActionInput,
  actorUserId: number,
): Promise<{ worksheet: ReconciliationWorksheet; posted: PostedVoucher }> {
  const magnitude = Math.abs(input.itemAmountCentavos);
  const cashSide = input.itemAmountCentavos > 0 ? "debit" : "credit";
  const offsetSide = cashSide === "debit" ? "credit" : "debit";

  const posted = await postNewVoucher(
    db,
    {
      barangayId: input.context.barangayId,
      periodId: input.context.periodId,
      entryDate: input.entryDate,
      book: "GJ",
      particulars: input.particulars,
      lines: [
        { accountId: input.context.glAccountId, side: cashSide, amountCentavos: magnitude },
        { accountId: input.offsetAccountId, side: offsetSide, amountCentavos: magnitude },
      ],
    },
    actorUserId,
  );

  await linkAdjustingEntry(db, {
    reconcilingItemId: input.reconcilingItemId,
    entryId: posted.entryId,
    linkedBy: actorUserId,
  });

  return { worksheet: await reloadWorksheet(db, input.context), posted };
}
