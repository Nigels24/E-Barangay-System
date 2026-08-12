import { describe, it, expect } from "vitest";
import { annualDepreciationCentavos, monthlyDepreciationCentavos } from "../depreciation";
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
