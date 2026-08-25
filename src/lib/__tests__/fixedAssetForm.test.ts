import { describe, it, expect } from "vitest";
import {
  emptyFixedAssetForm,
  fixedAssetProblems,
  residualRatePercentLabel,
  toNewFixedAssetInput,
  type FixedAssetFormState,
} from "../fixedAssetForm";
import { toCentavos } from "../money";

function filled(overrides: Partial<FixedAssetFormState> = {}): FixedAssetFormState {
  return {
    ...emptyFixedAssetForm(),
    category: "Office Equipment",
    description: "Steel filing cabinet",
    acquisitionDate: "2023-03-10",
    cost: "15,000.00",
    usefulLifeYears: "10",
    residualRatePercent: "10",
    ...overrides,
  };
}

describe("emptyFixedAssetForm", () => {
  it("defaults to the client's own 10-year / 10% residual convention (D17)", () => {
    const form = emptyFixedAssetForm();
    expect(form.usefulLifeYears).toBe("10");
    expect(form.residualRatePercent).toBe("10");
    expect(form.category).toBe("");
    expect(form.accountId).toBe("");
  });
});

describe("fixedAssetProblems", () => {
  it("is empty for a fully filled, valid form", () => {
    expect(fixedAssetProblems(filled())).toEqual([]);
  });

  it("flags a blank category, description, and acquisition date", () => {
    const problems = fixedAssetProblems(filled({ category: "", description: "", acquisitionDate: "" }));
    expect(problems).toContain("Give the asset a category.");
    expect(problems).toContain("Describe the asset.");
    expect(problems).toContain("Give the asset's acquisition date.");
  });

  it("flags an empty or unusable cost", () => {
    expect(fixedAssetProblems(filled({ cost: "" }))).toContain("Enter the asset's cost.");
    expect(fixedAssetProblems(filled({ cost: "not a number" }))).toContain('"not a number" is not an amount.');
  });

  it("flags a non-positive or non-integer useful life", () => {
    expect(fixedAssetProblems(filled({ usefulLifeYears: "0" }))).toContain(
      "Useful life must be a whole number of years, greater than zero.",
    );
    expect(fixedAssetProblems(filled({ usefulLifeYears: "5.5" }))).toContain(
      "Useful life must be a whole number of years, greater than zero.",
    );
    expect(fixedAssetProblems(filled({ usefulLifeYears: "" }))).toContain(
      "Useful life must be a whole number of years, greater than zero.",
    );
  });

  it("flags a residual rate outside [0, 100)", () => {
    expect(fixedAssetProblems(filled({ residualRatePercent: "100" }))).toContain(
      "Residual rate must be between 0 and 100.",
    );
    expect(fixedAssetProblems(filled({ residualRatePercent: "-1" }))).toContain(
      "Residual rate must be between 0 and 100.",
    );
  });

  it("a zero residual rate is allowed — full cost depreciates", () => {
    expect(fixedAssetProblems(filled({ residualRatePercent: "0" }))).toEqual([]);
  });

  it("no account chosen is not a problem — linking is optional", () => {
    expect(fixedAssetProblems(filled({ accountId: "" }))).toEqual([]);
  });
});

describe("toNewFixedAssetInput", () => {
  it("converts pesos to centavos and percent to a ratio, at the one boundary", () => {
    const input = toNewFixedAssetInput(filled({ accountId: "7", legacyCode: " 221 " }), 3);
    expect(input).toEqual({
      barangayId: 3,
      category: "Office Equipment",
      description: "Steel filing cabinet",
      acquisitionDate: "2023-03-10",
      costCentavos: toCentavos(15000),
      usefulLifeYears: 10,
      residualRate: 0.1,
      accountId: 7,
      legacyCode: "221",
    });
  });

  it("omits accountId and legacyCode when blank, rather than sending empty strings", () => {
    const input = toNewFixedAssetInput(filled({ accountId: "", legacyCode: "" }), 3);
    expect(input.accountId).toBeUndefined();
    expect(input.legacyCode).toBeUndefined();
  });

  it("throws rather than guessing when the form is unusable", () => {
    expect(() => toNewFixedAssetInput(filled({ cost: "" }), 3)).toThrow();
    expect(() => toNewFixedAssetInput(filled({ usefulLifeYears: "0" }), 3)).toThrow();
  });
});

describe("residualRatePercentLabel", () => {
  it("prints a stored ratio as a whole percent", () => {
    expect(residualRatePercentLabel(0.1)).toBe("10%");
    expect(residualRatePercentLabel(0)).toBe("0%");
  });
});
