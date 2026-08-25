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

/**
 * Whole months of depreciation elapsed from `acquisitionDate` through
 * `asOfDate`, per COA's own PPE Manual "15th-day rule": a month counts once
 * the asset is available for use on or before the 15th of that month;
 * acquired after the 15th, depreciation starts the following month instead.
 * Never negative (an asOfDate before the asset's depreciation even starts is
 * zero months, not a negative one), and never more than the asset's full
 * useful life — depreciation never continues past it.
 */
export function monthsDepreciated(acquisitionDate: string, asOfDate: string, usefulLifeYears: number): number {
  const [acqYear, acqMonth, acqDay] = acquisitionDate.split("-").map(Number);
  const [asOfYear, asOfMonth] = asOfDate.split("-").map(Number);

  const startMonthRaw = acqDay <= 15 ? acqMonth : acqMonth + 1;
  const startYear = startMonthRaw > 12 ? acqYear + 1 : acqYear;
  const startMonth = startMonthRaw > 12 ? startMonthRaw - 12 : startMonthRaw;

  const elapsed = (asOfYear - startYear) * 12 + (asOfMonth - startMonth) + 1;
  return Math.min(Math.max(elapsed, 0), usefulLifeYears * 12);
}

/**
 * Accumulated depreciation as of a date — monthly depreciation times the
 * number of months elapsed (per {@link monthsDepreciated}), capped at the
 * asset's full depreciable base so rounding across many months can never
 * push accumulated depreciation past cost * (1 - residualRate).
 */
export function accumulatedDepreciationCentavos(
  costCentavos: number,
  usefulLifeYears: number,
  residualRate: number,
  monthsElapsed: number,
): number {
  const monthly = monthlyDepreciationCentavos(costCentavos, usefulLifeYears, residualRate);
  const depreciableBaseCentavos = Math.round(costCentavos * (1 - residualRate));
  return Math.min(monthly * monthsElapsed, depreciableBaseCentavos);
}
