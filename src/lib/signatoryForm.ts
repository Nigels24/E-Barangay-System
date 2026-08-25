/**
 * The "add a signatory" form's rules, as pure functions — same reasoning as
 * `fixedAssetForm.ts`/`advanceForm.ts`: there is no React testing library in
 * this project, so anything worth being wrong about belongs here, under
 * vitest, not inside the component.
 */
import type { SignatoryRole } from "../db/schema";
import type { NewSignatoryInput } from "./queries/signatories";

const ROLE_LABELS: Record<SignatoryRole, string> = {
  prepared_by: "Prepared by",
  certified_by: "Certified by",
  approved_by: "Approved by",
};

export function signatoryRoleLabel(role: SignatoryRole): string {
  return ROLE_LABELS[role];
}

export const SIGNATORY_ROLE_OPTIONS: { value: SignatoryRole; label: string }[] = (
  ["prepared_by", "certified_by", "approved_by"] as const
).map((role) => ({ value: role, label: ROLE_LABELS[role] }));

export interface SignatoryFormState {
  role: SignatoryRole;
  name: string;
  designation: string;
  effectiveFrom: string;
}

/** A blank form, dated today — a new signatory almost always takes effect the day they're entered. */
export function emptySignatoryForm(effectiveFrom: string): SignatoryFormState {
  return { role: "prepared_by", name: "", designation: "", effectiveFrom };
}

export function signatoryProblems(form: SignatoryFormState): string[] {
  const problems: string[] = [];
  if (form.name.trim() === "") problems.push("Give the signatory's name.");
  if (form.designation.trim() === "") problems.push("Give the signatory's designation.");
  if (form.effectiveFrom.trim() === "") problems.push("Give the date this signatory takes effect.");
  return problems;
}

export function toNewSignatoryInput(form: SignatoryFormState, barangayId: number): NewSignatoryInput {
  return {
    barangayId,
    role: form.role,
    name: form.name.trim(),
    designation: form.designation.trim(),
    effectiveFrom: form.effectiveFrom,
  };
}
