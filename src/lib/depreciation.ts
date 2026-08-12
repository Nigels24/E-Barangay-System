/**
 * Depreciation formula, per docs/decisions.md D17: straight-line on
 * (1 - residualRate) of cost, residualRate defaulting to the client's own
 * standard 10%. This reproduces the client's real figures exactly on every
 * asset category that can be independently checked against
 * Com2023US.xl.xlsx (Other Equipment, IT Equipment) and within two centavos
 * on the rest (Office Building) — see the plan for the full comparison.
 *
 * Deliberately NOT stored anywhere (D18) — always computed from the asset's
 * own cost/life/residual fields, so it can never drift out of sync with them.
 */

/** Annual depreciation in centavos, rounded to the nearest centavo. */
export function annualDepreciationCentavos(
  costCentavos: number,
  usefulLifeYears: number,
  residualRate: number = 0.1,
): number {
  if (usefulLifeYears <= 0) throw new Error("usefulLifeYears must be positive");
  if (costCentavos < 0) throw new Error("costCentavos must not be negative");
  if (residualRate < 0 || residualRate >= 1) throw new Error("residualRate must be between 0 (inclusive) and 1 (exclusive)");

  const depreciableBase = costCentavos * (1 - residualRate);
  return Math.round(depreciableBase / usefulLifeYears);
}

/**
 * Monthly depreciation, per docs/decisions.md D19: the client's own
 * accumulated depreciation moves between consecutive monthly trial
 * balances, so it is recognised monthly, not once a year.
 */
export function monthlyDepreciationCentavos(
  costCentavos: number,
  usefulLifeYears: number,
  residualRate: number = 0.1,
): number {
  return Math.round(annualDepreciationCentavos(costCentavos, usefulLifeYears, residualRate) / 12);
}
