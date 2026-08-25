/**
 * The "add a fixed asset" form's rules, as pure functions — same reasoning
 * as `voucher.ts`: there is no React testing library in this project, so
 * anything worth being wrong about belongs here, under vitest, not inside
 * the component.
 */
import { parseAmount } from "./voucher";
import type { NewFixedAssetInput } from "./queries/fixedAssets";

/** The form's fields, holding exactly what the DOM controls hold: strings. */
export interface FixedAssetFormState {
  category: string;
  description: string;
  acquisitionDate: string;
  /** Pesos, exactly as typed. Converted to centavos at the one boundary in {@link toNewFixedAssetInput}. */
  cost: string;
  usefulLifeYears: string;
  /** A whole-number percent as typed, e.g. "10" — divided by 100 at the same boundary. */
  residualRatePercent: string;
  /** `""` until an account is chosen — linking is optional (D20's mapping is still being confirmed). */
  accountId: string;
  legacyCode: string;
}

/** A blank form. Ten years and a 10% residual rate are the client's own defaults (D17), not blanks the bookkeeper has to type every time. */
export function emptyFixedAssetForm(): FixedAssetFormState {
  return {
    category: "",
    description: "",
    acquisitionDate: "",
    cost: "",
    usefulLifeYears: "10",
    residualRatePercent: "10",
    accountId: "",
    legacyCode: "",
  };
}

/** A whole, non-negative percent, parsed the same way an amount is — reject rather than silently coerce. */
function parsePercent(text: string): { value: number | null; message: string | null } {
  const trimmed = text.trim();
  if (trimmed === "") return { value: null, message: "Give a residual rate." };
  const value = Number(trimmed);
  if (!Number.isFinite(value)) return { value: null, message: `"${trimmed}" is not a percent.` };
  if (value < 0 || value >= 100) return { value: null, message: "Residual rate must be between 0 and 100." };
  return { value, message: null };
}

/**
 * Everything standing between this form and a postable asset, in the order
 * a person would fix them. An empty list means the button may be enabled.
 */
export function fixedAssetProblems(form: FixedAssetFormState): string[] {
  const problems: string[] = [];

  if (form.category.trim() === "") problems.push("Give the asset a category.");
  if (form.description.trim() === "") problems.push("Describe the asset.");
  if (form.acquisitionDate.trim() === "") problems.push("Give the asset's acquisition date.");

  const cost = parseAmount(form.cost);
  if (cost.empty) problems.push("Enter the asset's cost.");
  else if (cost.message) problems.push(cost.message);

  const life = Number(form.usefulLifeYears.trim());
  if (form.usefulLifeYears.trim() === "" || !Number.isInteger(life) || life <= 0) {
    problems.push("Useful life must be a whole number of years, greater than zero.");
  }

  const residual = parsePercent(form.residualRatePercent);
  if (residual.message) problems.push(residual.message);

  return problems;
}

/**
 * Converts the form into the engine's input. Throws rather than guessing:
 * callers check {@link fixedAssetProblems} first, so reaching the throw
 * means the two disagreed and the safe thing is to stop, the same contract
 * `voucher.ts`'s `toDraftLines` keeps.
 */
export function toNewFixedAssetInput(
  form: FixedAssetFormState,
  barangayId: number,
): NewFixedAssetInput {
  const { centavos } = parseAmount(form.cost);
  if (centavos === null) throw new Error("The asset has no usable cost.");

  const usefulLifeYears = Number(form.usefulLifeYears.trim());
  if (!Number.isInteger(usefulLifeYears) || usefulLifeYears <= 0) {
    throw new Error("The asset has no usable useful life.");
  }

  const { value: residualPercent } = parsePercent(form.residualRatePercent);
  if (residualPercent === null) throw new Error("The asset has no usable residual rate.");

  return {
    barangayId,
    category: form.category.trim(),
    description: form.description.trim(),
    acquisitionDate: form.acquisitionDate,
    costCentavos: centavos,
    usefulLifeYears,
    residualRate: residualPercent / 100,
    accountId: form.accountId === "" ? undefined : Number(form.accountId),
    legacyCode: form.legacyCode.trim() === "" ? undefined : form.legacyCode.trim(),
  };
}

/** `0.10 -> "10"` — how the register's stored ratio prints as a whole percent in the asset table. */
export function residualRatePercentLabel(residualRate: number): string {
  return `${Math.round(residualRate * 100 * 100) / 100}%`;
}
