/**
 * The "resolve a provisional code" field's rules, as a pure function — same
 * reasoning as `voucher.ts`/`fixedAssetForm.ts`: there is no React testing
 * library in this project, so anything worth being wrong about belongs
 * here, under vitest, not inside the component.
 */

/**
 * `existingCodes` should be every OTHER account's code currently loaded on
 * screen — this is a friendly early check, not the real guarantee. The
 * schema's own `UNIQUE` constraint on `account.code` (D12) is what actually
 * prevents a collision; this just turns that into a sentence before the
 * write is even attempted.
 */
export function newCodeProblems(newCode: string, existingCodes: readonly string[]): string[] {
  const problems: string[] = [];
  const trimmed = newCode.trim();
  if (trimmed === "") {
    problems.push("Give the confirmed account code.");
  } else if (existingCodes.includes(trimmed)) {
    problems.push(`"${trimmed}" is already used by another account.`);
  } else if (trimmed.startsWith("PENDING-")) {
    problems.push("A confirmed code can't itself be another placeholder.");
  }
  return problems;
}
