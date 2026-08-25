/**
 * The "grant an advance" and "liquidate an advance" forms' rules, as pure
 * functions — same reasoning as `fixedAssetForm.ts` and `voucher.ts`: there
 * is no React testing library in this project, so anything worth being
 * wrong about belongs here, under vitest, not inside the component.
 */
import { parseAmount } from "./voucher";
import { formatPeso } from "./money";
import type { NewAdvanceInput } from "./queries/advances";

/** The grant-form's fields, holding exactly what the DOM controls hold: strings. */
export interface AdvanceFormState {
  dateGranted: string;
  payee: string;
  particulars: string;
  /** Pesos, exactly as typed. Converted to centavos at the one boundary in {@link toNewAdvanceInput}. */
  amount: string;
}

/** A blank form, dated today — a cash advance is almost always granted the day it's typed in. */
export function emptyAdvanceForm(dateGranted: string): AdvanceFormState {
  return { dateGranted, payee: "", particulars: "", amount: "" };
}

/**
 * Everything standing between this form and a grantable advance, in the
 * order a person would fix them. An empty list means the button may be
 * enabled.
 */
export function advanceProblems(form: AdvanceFormState): string[] {
  const problems: string[] = [];

  if (form.dateGranted.trim() === "") problems.push("Give the date the advance was granted.");
  if (form.payee.trim() === "") problems.push("Name who the advance was granted to.");
  if (form.particulars.trim() === "") problems.push("Describe what the advance is for.");

  const amount = parseAmount(form.amount);
  if (amount.empty) problems.push("Enter the amount granted.");
  else if (amount.message) problems.push(amount.message);

  return problems;
}

/**
 * Converts the form into the engine's input. Throws rather than guessing:
 * callers check {@link advanceProblems} first, so reaching the throw means
 * the two disagreed and the safe thing is to stop, the same contract
 * `voucher.ts`'s `toDraftLines` keeps.
 */
export function toNewAdvanceInput(form: AdvanceFormState, barangayId: number): NewAdvanceInput {
  const { centavos } = parseAmount(form.amount);
  if (centavos === null) throw new Error("The advance has no usable amount.");

  return {
    barangayId,
    dateGranted: form.dateGranted,
    payee: form.payee.trim(),
    particulars: form.particulars.trim(),
    amountCentavos: centavos,
  };
}

/**
 * The liquidation field's own rule: a positive amount, never more than what
 * is still outstanding. Kept separate from {@link advanceProblems} since it
 * gates a different button against a different, per-row piece of state.
 */
export function liquidationProblems(amountText: string, outstandingCentavos: number): string[] {
  const problems: string[] = [];
  const amount = parseAmount(amountText);
  if (amount.empty) problems.push("Enter the amount liquidated.");
  else if (amount.message) problems.push(amount.message);
  else if (amount.centavos !== null && amount.centavos > outstandingCentavos) {
    problems.push(`Cannot liquidate more than the ${formatPeso(outstandingCentavos)} still outstanding.`);
  }
  return problems;
}

/** Converts a typed liquidation amount to centavos. Throws rather than guessing, same contract as {@link toNewAdvanceInput}. */
export function toLiquidationCentavos(amountText: string): number {
  const { centavos } = parseAmount(amountText);
  if (centavos === null) throw new Error("The liquidation has no usable amount.");
  return centavos;
}
