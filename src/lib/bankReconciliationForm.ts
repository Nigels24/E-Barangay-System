/**
 * The bank-reconciliation screen's forms, as pure functions — same reasoning
 * as `voucher.ts`/`fixedAssetForm.ts`/`advanceForm.ts`: there is no React
 * testing library in this project, so anything worth being wrong about
 * belongs here, under vitest, not inside the component.
 */
import { toCentavos } from "./money";
import type { NewBankAccountInput } from "./queries/bankReconciliation";
import type { ReconcilingItemType, ReconcilingSide } from "../db/schema";

/**
 * A non-negative amount field, for a bank statement's own ending balance.
 * Not `voucher.ts`'s `parseAmount` — that rejects zero because a voucher
 * *line* can never be for nothing, but a brand-new bank account can
 * genuinely have a ₱0.00 statement balance, and refusing that would be a
 * real usability bug, not a safety rule.
 */
function parseNonNegativeAmount(text: string): { centavos: number | null; empty: boolean; message: string | null } {
  const trimmed = text.trim();
  if (trimmed === "") return { centavos: null, empty: true, message: null };

  let centavos: number;
  try {
    centavos = toCentavos(trimmed);
  } catch {
    return { centavos: null, empty: false, message: `"${trimmed}" is not an amount.` };
  }
  if (centavos < 0) {
    return { centavos: null, empty: false, message: "A statement balance cannot be negative." };
  }
  return { centavos, empty: false, message: null };
}

/* ------------------------------------------------------------------ */
/* Add a bank account (D2)                                              */
/* ------------------------------------------------------------------ */

export interface BankAccountFormState {
  bankName: string;
  accountNo: string;
  accountName: string;
  glAccountId: string;
}

export function emptyBankAccountForm(): BankAccountFormState {
  return { bankName: "", accountNo: "", accountName: "", glAccountId: "" };
}

export function bankAccountProblems(form: BankAccountFormState): string[] {
  const problems: string[] = [];
  if (form.bankName.trim() === "") problems.push("Give the bank's name.");
  if (form.accountNo.trim() === "") problems.push("Give the account number.");
  if (form.accountName.trim() === "") problems.push("Give the account name (e.g. General Fund).");
  if (form.glAccountId === "") problems.push("Choose which Cash in Bank ledger account this controls.");
  return problems;
}

export function toNewBankAccountInput(form: BankAccountFormState, barangayId: number): NewBankAccountInput {
  if (form.glAccountId === "") throw new Error("No ledger account chosen.");
  return {
    barangayId,
    bankName: form.bankName.trim(),
    accountNo: form.accountNo.trim(),
    accountName: form.accountName.trim(),
    glAccountId: Number(form.glAccountId),
  };
}

/* ------------------------------------------------------------------ */
/* Start / correct the reconciliation header (D3)                       */
/* ------------------------------------------------------------------ */

export interface ReconciliationHeaderFormState {
  statementDate: string;
  /** Pesos, exactly as typed. Never negative — a bank statement balance isn't. */
  statementBalance: string;
}

export function emptyReconciliationHeaderForm(statementDate: string): ReconciliationHeaderFormState {
  return { statementDate, statementBalance: "" };
}

export function reconciliationHeaderProblems(form: ReconciliationHeaderFormState): string[] {
  const problems: string[] = [];
  if (form.statementDate.trim() === "") problems.push("Give the bank statement's date.");

  const amount = parseNonNegativeAmount(form.statementBalance);
  if (amount.empty) problems.push("Enter the statement's ending balance.");
  else if (amount.message) problems.push(amount.message);

  return problems;
}

export function toReconciliationHeaderCentavos(form: ReconciliationHeaderFormState): number {
  const { centavos } = parseNonNegativeAmount(form.statementBalance);
  if (centavos === null) throw new Error("The statement balance is not usable.");
  return centavos;
}

/* ------------------------------------------------------------------ */
/* Add a reconciling item (D4, D5)                                      */
/* ------------------------------------------------------------------ */

/**
 * The categories that make sense for each side (D5's own table: bank-side
 * is always a timing difference, book-side is always something genuinely
 * missing from the books). This is a form-layer guide rail, not a database
 * rule — `reconciling_side_valid` and `reconciling_item_type_valid` are
 * separate CHECK constraints in schema.ts, so the engine itself does not
 * enforce this pairing. "Other" is offered on both, per D4's own escape
 * hatch.
 */
const BANK_SIDE_TYPES: readonly ReconcilingItemType[] = [
  "checks_issued_not_taken_up",
  "checks_issued_overstated",
  "deposit_understated",
  "deposit_overstated",
  "other",
];
const BOOK_SIDE_TYPES: readonly ReconcilingItemType[] = ["debit_memo", "credit_memo", "prior_years_adjustment", "other"];

export function reconcilingItemTypesForSide(side: ReconcilingSide): readonly ReconcilingItemType[] {
  return side === "bank" ? BANK_SIDE_TYPES : BOOK_SIDE_TYPES;
}

export interface ReconcilingItemFormState {
  side: ReconcilingSide;
  itemType: ReconcilingItemType;
  /** Signed pesos, exactly as typed — a leading "-" decreases the balance on that side (schema.ts). */
  amount: string;
  explanation: string;
}

export function emptyReconcilingItemForm(): ReconcilingItemFormState {
  return { side: "bank", itemType: "checks_issued_not_taken_up", amount: "", explanation: "" };
}

/**
 * A signed amount field: like `parseAmount`, but a reconciling item is
 * allowed to be negative (it is the sign that says which direction the
 * balance moves) — only zero is refused, matching the engine's own
 * `addReconcilingItem` check.
 */
export function parseSignedAmount(text: string): { centavos: number | null; empty: boolean; message: string | null } {
  const trimmed = text.trim();
  if (trimmed === "") return { centavos: null, empty: true, message: null };

  let centavos: number;
  try {
    centavos = toCentavos(trimmed);
  } catch {
    return { centavos: null, empty: false, message: `"${trimmed}" is not an amount.` };
  }
  if (centavos === 0) {
    return { centavos: null, empty: false, message: "An amount cannot be zero." };
  }
  return { centavos, empty: false, message: null };
}

export function reconcilingItemProblems(form: ReconcilingItemFormState): string[] {
  const problems: string[] = [];
  const amount = parseSignedAmount(form.amount);
  if (amount.empty) {
    problems.push(
      "Enter the amount — positive if it adds to the balance, a leading minus sign (e.g. -500.00) if it reduces it.",
    );
  } else if (amount.message) {
    problems.push(amount.message);
  }
  return problems;
}

export interface NewReconcilingItemInput {
  side: ReconcilingSide;
  itemType: ReconcilingItemType;
  amountCentavos: number;
  explanation?: string;
}

export function toNewReconcilingItemInput(form: ReconcilingItemFormState): NewReconcilingItemInput {
  const { centavos } = parseSignedAmount(form.amount);
  if (centavos === null) throw new Error("The reconciling item has no usable amount.");
  return {
    side: form.side,
    itemType: form.itemType,
    amountCentavos: centavos,
    explanation: form.explanation.trim() === "" ? undefined : form.explanation.trim(),
  };
}

/* ------------------------------------------------------------------ */
/* Create the adjusting entry for a book-side item (D5)                 */
/* ------------------------------------------------------------------ */

export interface AdjustingEntryFormState {
  offsetAccountId: string;
  particulars: string;
}

export function emptyAdjustingEntryForm(particulars: string): AdjustingEntryFormState {
  return { offsetAccountId: "", particulars };
}

export function adjustingEntryProblems(form: AdjustingEntryFormState): string[] {
  const problems: string[] = [];
  if (form.offsetAccountId === "") problems.push("Choose the other account this adjustment affects.");
  if (form.particulars.trim() === "") problems.push("Say what this adjustment is for.");
  return problems;
}

/* ------------------------------------------------------------------ */
/* Mark a check cleared (D6)                                            */
/* ------------------------------------------------------------------ */

export function clearedDateProblems(clearedDate: string, checkDate: string): string[] {
  const problems: string[] = [];
  if (clearedDate.trim() === "") problems.push("Give the date the check cleared.");
  else if (clearedDate < checkDate) problems.push("A check cannot clear before it was written.");
  return problems;
}
