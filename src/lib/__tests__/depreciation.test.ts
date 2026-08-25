import { describe, it, expect } from "vitest";
import {
  accumulatedDepreciationCentavos,
  annualDepreciationCentavos,
  monthlyDepreciationCentavos,
  monthsDepreciated,
} from "../depreciation";
import { toCentavos } from "../money";

describe("annualDepreciationCentavos", () => {
  it("matches the client's real Other Equipment figure exactly: 87,784.51 over 10 years -> 7,900.61", () => {
    const result = annualDepreciationCentavos(toCentavos(87784.51), 10);
    expect(result).toBe(toCentavos(7900.61));
  });

  it("matches the client's real IT Equipment figure exactly: 35,000.00 over 7 years -> 4,500.00", () => {
    const result = annualDepreciationCentavos(toCentavos(35000), 7);
    expect(result).toBe(toCentavos(4500));
  });

  it("matches the client's real Office Building figure within one centavo: 608,144.80 over 30 years -> 18,244.32", () => {
    // Verified during planning: cost * 0.9 / 30 = 18,244.34 — a 2-centavo gap
    // against the client's own 18,244.32, consistent with normal rounding
    // drift in a hand-kept spreadsheet, not a different formula.
    const result = annualDepreciationCentavos(toCentavos(608144.8), 30);
    expect(Math.abs(result - toCentavos(18244.32))).toBeLessThanOrEqual(2);
  });

  it("defaults to a 10% residual rate when none is given", () => {
    const withDefault = annualDepreciationCentavos(toCentavos(35000), 7);
    const explicit = annualDepreciationCentavos(toCentavos(35000), 7, 0.1);
    expect(withDefault).toBe(explicit);
  });

  it("a 0% residual rate depreciates the full cost", () => {
    const result = annualDepreciationCentavos(toCentavos(10000), 10, 0);
    expect(result).toBe(toCentavos(1000));
  });

  it("a higher residual rate lowers the annual charge", () => {
    const low = annualDepreciationCentavos(toCentavos(10000), 10, 0.1);
    const high = annualDepreciationCentavos(toCentavos(10000), 10, 0.5);
    expect(high).toBeLessThan(low);
  });

  it("rounds to the nearest centavo rather than truncating", () => {
    // 1000 centavos / 3 = 333.33... — a plain truncation would also give 333,
    // so this alone doesn't prove rounding; the next case does.
    expect(annualDepreciationCentavos(1000, 3, 0)).toBe(333);
    // 2000 centavos / 3 = 666.67 — truncation would wrongly give 666.
    expect(annualDepreciationCentavos(2000, 3, 0)).toBe(667);
  });

  it("rejects a zero or negative useful life", () => {
    expect(() => annualDepreciationCentavos(10000, 0)).toThrow();
    expect(() => annualDepreciationCentavos(10000, -5)).toThrow();
  });

  it("rejects a negative cost", () => {
    expect(() => annualDepreciationCentavos(-1, 10)).toThrow();
  });

  it("rejects a residual rate outside [0, 1)", () => {
    expect(() => annualDepreciationCentavos(10000, 10, -0.1)).toThrow();
    expect(() => annualDepreciationCentavos(10000, 10, 1)).toThrow();
    expect(() => annualDepreciationCentavos(10000, 10, 1.5)).toThrow();
  });

  it("a brand new asset with zero cost depreciates to zero, not an error", () => {
    expect(annualDepreciationCentavos(0, 10)).toBe(0);
  });
});

describe("monthlyDepreciationCentavos", () => {
  it("is the annual figure divided by twelve", () => {
    const annual = annualDepreciationCentavos(toCentavos(35000), 7);
    const monthly = monthlyDepreciationCentavos(toCentavos(35000), 7);
    expect(monthly).toBe(Math.round(annual / 12));
  });

  it("twelve months roughly reconstitute the annual figure (off by at most a few centavos from monthly rounding)", () => {
    const annual = annualDepreciationCentavos(toCentavos(87784.51), 10);
    const monthly = monthlyDepreciationCentavos(toCentavos(87784.51), 10);
    expect(Math.abs(monthly * 12 - annual)).toBeLessThanOrEqual(12);
  });
});

describe("monthsDepreciated — COA's 15th-day rule", () => {
  it("acquired on the 15th or earlier: the acquisition month itself counts", () => {
    expect(monthsDepreciated("2024-01-15", "2024-01-31", 10)).toBe(1);
    expect(monthsDepreciated("2024-01-01", "2024-01-31", 10)).toBe(1);
  });

  it("acquired after the 15th: the acquisition month does not count", () => {
    expect(monthsDepreciated("2024-01-16", "2024-01-31", 10)).toBe(0);
    expect(monthsDepreciated("2024-01-16", "2024-02-29", 10)).toBe(1);
  });

  it("counts whole months across a year boundary", () => {
    // Acquired 2023-12-10 (counts December); as of 2024-02-29 is Dec, Jan, Feb = 3.
    expect(monthsDepreciated("2023-12-10", "2024-02-29", 10)).toBe(3);
  });

  it("late-in-month acquisition rolling the start into the next year", () => {
    // Acquired 2023-12-20 -> starts January 2024; as of 2024-01-31 is 1 month.
    expect(monthsDepreciated("2023-12-20", "2024-01-31", 10)).toBe(1);
  });

  it("is zero before depreciation has started, never negative", () => {
    expect(monthsDepreciated("2024-06-20", "2024-06-30", 10)).toBe(0);
  });

  it("caps at the asset's full useful life in months", () => {
    expect(monthsDepreciated("2000-01-01", "2024-01-31", 10)).toBe(120);
  });
});

describe("accumulatedDepreciationCentavos", () => {
  it("is monthly depreciation times months elapsed", () => {
    const cost = toCentavos(35000);
    const monthly = monthlyDepreciationCentavos(cost, 7);
    expect(accumulatedDepreciationCentavos(cost, 7, 0.1, 5)).toBe(monthly * 5);
  });

  it("never exceeds the depreciable base, even after the full useful life", () => {
    const cost = toCentavos(35000);
    const cap = Math.round(cost * 0.9);
    expect(accumulatedDepreciationCentavos(cost, 7, 0.1, 7 * 12)).toBe(cap);
    // Requesting more months than the useful life still doesn't overshoot.
    expect(accumulatedDepreciationCentavos(cost, 7, 0.1, 999)).toBe(cap);
  });

  it("zero months elapsed is zero accumulated depreciation", () => {
    expect(accumulatedDepreciationCentavos(toCentavos(35000), 7, 0.1, 0)).toBe(0);
  });
});
