/**
 * Bank reconciliation (docs/decisions.md D1-D8): bank accounts, a monthly
 * reconciliation worksheet per account, and its reconciling items.
 *
 * The single most important rule in this module is D5: **a reconciliation
 * never posts a journal entry by itself.** A bank-side item (an outstanding
 * check, a deposit in transit) is a timing difference — the books are
 * already correct, and journalising it would corrupt the ledger. A book-side
 * item (a service charge, an interest credit, a recording error) is
 * genuinely missing from the books and needs a real voucher — but that
 * voucher is created and posted through the ordinary posting path
 * (`postNewVoucher`, `src/lib/queries/journal.ts`) by the bookkeeper
 * reviewing it, and only `linkAdjustingEntry` below records which voucher
 * that turned out to be. Nothing in this file ever touches
 * `journal_entry`/`journal_entry_line` directly.
 *
 * Same audit-logged, single-transaction write every other engine module
 * uses (D30).
 */
import { and, eq } from "drizzle-orm";
import {
  bankAccount,
  bankReconciliation,
  journalEntry,
  reconcilingItem,
  type ReconcilingItemType,
  type ReconcilingSide,
} from "../../db/schema";
import { statement, type EngineDb } from "./types";
import { InvalidStatusError } from "./errors";
import { auditStatement } from "./audit";
import { nextRowId } from "./ids";

/* ------------------------------------------------------------------ */
/* Bank accounts (D2)                                                   */
/* ------------------------------------------------------------------ */

export interface CreateBankAccountInput {
  barangayId: number;
  bankName: string;
  accountNo: string;
  accountName: string;
  /** The Cash in Bank ledger account this bank account is controlled by. */
  glAccountId: number;
  recordedBy: number;
}

export async function createBankAccount(db: EngineDb, input: CreateBankAccountInput) {
  if (input.bankName.trim() === "") throw new InvalidStatusError("A bank account needs a bank name");
  if (input.accountNo.trim() === "") throw new InvalidStatusError("A bank account needs an account number");
  if (input.accountName.trim() === "") throw new InvalidStatusError("A bank account needs an account name");

  const id = await nextRowId(db, "bank_account");
  const row = {
    id,
    barangayId: input.barangayId,
    bankName: input.bankName.trim(),
    accountNo: input.accountNo.trim(),
    accountName: input.accountName.trim(),
    glAccountId: input.glAccountId,
    isActive: true,
  };

  await db.writeBatch([
    statement(db.query.insert(bankAccount).values(row)),
    auditStatement(db, input.recordedBy, "bank_account.create", "bank_account", id, null, row),
  ]);

  return readBankAccount(db, id);
}

async function readBankAccount(db: EngineDb, bankAccountId: number) {
  const row = await db.query.select().from(bankAccount).where(eq(bankAccount.id, bankAccountId)).get();
  if (!row) throw new InvalidStatusError(`Bank account ${bankAccountId} does not exist`);
  return row;
}

/* ------------------------------------------------------------------ */
/* The reconciliation worksheet itself (D1, D3, D7)                     */
/* ------------------------------------------------------------------ */

export interface StartReconciliationInput {
  bankAccountId: number;
  periodId: number;
  statementDate: string;
  statementBalanceCentavos: number;
  /** The ledger's Cash in Bank balance at the moment this worksheet was started — a best-effort snapshot; see `finalizeReconciliation` for the authoritative one. */
  bookBalanceCentavos: number;
  preparedBy: number;
}

/**
 * Starts this period's reconciliation for a bank account. `bank_recon_
 * account_period_uq` (schema.ts) refuses a second one for the same account
 * and period at the database level; this checks first so the refusal reads
 * as a sentence rather than a raw constraint-violation message.
 */
export async function startReconciliation(db: EngineDb, input: StartReconciliationInput) {
  const existing = await db.query
    .select({ id: bankReconciliation.id })
    .from(bankReconciliation)
    .where(
      and(eq(bankReconciliation.bankAccountId, input.bankAccountId), eq(bankReconciliation.periodId, input.periodId)),
    )
    .get();
  if (existing) {
    throw new InvalidStatusError("This bank account already has a reconciliation for this period");
  }
  if (input.statementDate.trim() === "") throw new InvalidStatusError("A reconciliation needs a statement date");

  const id = await nextRowId(db, "bank_reconciliation");
  const row = {
    id,
    bankAccountId: input.bankAccountId,
    periodId: input.periodId,
    statementDate: input.statementDate,
    statementBalanceCentavos: input.statementBalanceCentavos,
    bookBalanceCentavos: input.bookBalanceCentavos,
    status: "draft" as const,
    preparedBy: input.preparedBy,
  };

  await db.writeBatch([
    statement(db.query.insert(bankReconciliation).values(row)),
    auditStatement(db, input.preparedBy, "bank_reconciliation.start", "bank_reconciliation", id, null, row),
  ]);

  return readReconciliation(db, id);
}

async function readReconciliation(db: EngineDb, reconciliationId: number) {
  const row = await db.query.select().from(bankReconciliation).where(eq(bankReconciliation.id, reconciliationId)).get();
  if (!row) throw new InvalidStatusError(`Reconciliation ${reconciliationId} does not exist`);
  return row;
}

export interface UpdateReconciliationHeaderInput {
  reconciliationId: number;
  statementDate: string;
  statementBalanceCentavos: number;
  updatedBy: number;
}

/**
 * Corrects the statement date/balance while the worksheet is still a draft —
 * these are hand-keyed (D3) and a typo should not force abandoning and
 * restarting the whole reconciliation. Refused once finalised: a final
 * reconciliation is the statutory record and does not get quietly edited,
 * the same principle every other "once it's real, it's final" rule in this
 * app follows.
 */
export async function updateReconciliationHeader(db: EngineDb, input: UpdateReconciliationHeaderInput) {
  const reconciliation = await readReconciliation(db, input.reconciliationId);
  if (reconciliation.status !== "draft") {
    throw new InvalidStatusError("A finalised reconciliation cannot be edited");
  }
  if (input.statementDate.trim() === "") throw new InvalidStatusError("A reconciliation needs a statement date");

  const updated = {
    statementDate: input.statementDate,
    statementBalanceCentavos: input.statementBalanceCentavos,
  };

  await db.writeBatch([
    statement(db.query.update(bankReconciliation).set(updated).where(eq(bankReconciliation.id, input.reconciliationId))),
    auditStatement(
      db,
      input.updatedBy,
      "bank_reconciliation.update_header",
      "bank_reconciliation",
      input.reconciliationId,
      reconciliation,
      { ...reconciliation, ...updated },
    ),
  ]);

  return readReconciliation(db, input.reconciliationId);
}

/* ------------------------------------------------------------------ */
/* Reconciling items (D4, D5)                                           */
/* ------------------------------------------------------------------ */

export interface AddReconcilingItemInput {
  reconciliationId: number;
  side: ReconcilingSide;
  itemType: ReconcilingItemType;
  /** Signed: negative reduces the balance on that side (schema.ts). */
  amountCentavos: number;
  explanation?: string;
  /** The check this item refers to, when it is an outstanding-check item (D6). */
  relatedEntryId?: number;
  recordedBy: number;
}

export async function addReconcilingItem(db: EngineDb, input: AddReconcilingItemInput) {
  const reconciliation = await readReconciliation(db, input.reconciliationId);
  if (reconciliation.status !== "draft") {
    throw new InvalidStatusError("Cannot add an item to a finalised reconciliation");
  }
  if (input.amountCentavos === 0) throw new InvalidStatusError("A reconciling item cannot be for zero");

  const id = await nextRowId(db, "reconciling_item");
  const row = {
    id,
    reconciliationId: input.reconciliationId,
    side: input.side,
    itemType: input.itemType,
    amountCentavos: input.amountCentavos,
    explanation: input.explanation?.trim() || null,
    relatedEntryId: input.relatedEntryId ?? null,
    adjustingEntryId: null,
  };

  await db.writeBatch([
    statement(db.query.insert(reconcilingItem).values(row)),
    auditStatement(db, input.recordedBy, "reconciling_item.create", "reconciling_item", id, null, row),
  ]);

  return readReconcilingItem(db, id);
}

async function readReconcilingItem(db: EngineDb, itemId: number) {
  const row = await db.query.select().from(reconcilingItem).where(eq(reconcilingItem.id, itemId)).get();
  if (!row) throw new InvalidStatusError(`Reconciling item ${itemId} does not exist`);
  return row;
}

export interface LinkAdjustingEntryInput {
  reconcilingItemId: number;
  entryId: number;
  linkedBy: number;
}

/**
 * Records which posted voucher turned out to be a book-side item's
 * adjusting entry, after the bookkeeper reviewed and posted it themselves
 * through the ordinary voucher screen (D5). This is bookkeeping, not
 * posting: it never touches `journal_entry`.
 */
export async function linkAdjustingEntry(db: EngineDb, input: LinkAdjustingEntryInput) {
  const item = await readReconcilingItem(db, input.reconcilingItemId);
  if (item.side !== "book") {
    throw new InvalidStatusError("A bank-side timing difference must never be journalised (D5)");
  }
  if (item.adjustingEntryId !== null) {
    throw new InvalidStatusError("This item already has an adjusting entry linked");
  }

  const updated = { adjustingEntryId: input.entryId };

  await db.writeBatch([
    statement(db.query.update(reconcilingItem).set(updated).where(eq(reconcilingItem.id, input.reconcilingItemId))),
    auditStatement(
      db,
      input.linkedBy,
      "reconciling_item.link_adjusting_entry",
      "reconciling_item",
      input.reconcilingItemId,
      item,
      { ...item, ...updated },
    ),
  ]);

  return readReconcilingItem(db, input.reconcilingItemId);
}

/* ------------------------------------------------------------------ */
/* Finalizing (D7)                                                      */
/* ------------------------------------------------------------------ */

export interface FinalizeReconciliationInput {
  reconciliationId: number;
  /** The ledger's Cash in Bank balance, recomputed fresh right now — this becomes the authoritative frozen figure (schema.ts: "captured when finalised"). */
  currentBookBalanceCentavos: number;
  varianceCentavos: number;
  /** Required only when varianceCentavos is not zero (D7). */
  varianceOverrideReason?: string;
  finalizedBy: number;
}

/**
 * Marks a reconciliation final. Refused while a nonzero variance has no
 * override reason (D7) — never blocked outright, since that is what drives
 * a bookkeeper to keep a shadow spreadsheet, but never silent either.
 */
export async function finalizeReconciliation(db: EngineDb, input: FinalizeReconciliationInput) {
  const reconciliation = await readReconciliation(db, input.reconciliationId);
  if (reconciliation.status !== "draft") {
    throw new InvalidStatusError("This reconciliation is already finalised");
  }
  if (input.varianceCentavos !== 0 && !input.varianceOverrideReason?.trim()) {
    throw new InvalidStatusError(
      "The bank and book balances do not agree. Resolve the variance, or give a written reason to override it.",
    );
  }

  const updated = {
    status: "final" as const,
    bookBalanceCentavos: input.currentBookBalanceCentavos,
    finalisedAt: new Date().toISOString(),
    finalisedBy: input.finalizedBy,
    varianceOverrideReason: input.varianceCentavos !== 0 ? input.varianceOverrideReason!.trim() : null,
  };

  await db.writeBatch([
    statement(db.query.update(bankReconciliation).set(updated).where(eq(bankReconciliation.id, input.reconciliationId))),
    auditStatement(
      db,
      input.finalizedBy,
      "bank_reconciliation.finalize",
      "bank_reconciliation",
      input.reconciliationId,
      reconciliation,
      { ...reconciliation, ...updated },
    ),
  ]);

  return readReconciliation(db, input.reconciliationId);
}

/* ------------------------------------------------------------------ */
/* Outstanding checks (D6)                                              */
/* ------------------------------------------------------------------ */

export interface MarkCheckClearedInput {
  entryId: number;
  clearedDate: string;
  clearedBy: number;
}

/**
 * Records that a check has appeared on a bank statement — set once, never
 * un-set. `journal_entry`'s own `cleared_after_issued` CHECK backstops the
 * date ordering at the database level; this is the friendly refusal in
 * front of it.
 */
export async function markCheckCleared(db: EngineDb, input: MarkCheckClearedInput) {
  const entry = await db.query.select().from(journalEntry).where(eq(journalEntry.id, input.entryId)).get();
  if (!entry) throw new InvalidStatusError(`Journal entry ${input.entryId} does not exist`);
  if (entry.book !== "CkDJ" || entry.status !== "posted") {
    throw new InvalidStatusError("Only a posted check disbursement can be marked cleared");
  }
  if (entry.clearedDate) {
    throw new InvalidStatusError(`This check was already marked cleared on ${entry.clearedDate}`);
  }
  if (!entry.checkDate || input.clearedDate < entry.checkDate) {
    throw new InvalidStatusError("A check cannot clear before it was written");
  }

  const updated = { clearedDate: input.clearedDate };

  await db.writeBatch([
    statement(db.query.update(journalEntry).set(updated).where(eq(journalEntry.id, input.entryId))),
    auditStatement(db, input.clearedBy, "journal_entry.mark_cleared", "journal_entry", input.entryId, entry, {
      ...entry,
      ...updated,
    }),
  ]);

  const cleared = await db.query.select().from(journalEntry).where(eq(journalEntry.id, input.entryId)).get();
  if (!cleared) throw new InvalidStatusError(`Journal entry ${input.entryId} disappeared after being written`);
  return cleared;
}
