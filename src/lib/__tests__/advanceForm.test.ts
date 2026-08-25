import { describe, it, expect } from "vitest";
import {
  advanceProblems,
  emptyAdvanceForm,
  liquidationProblems,
  toLiquidationCentavos,
  toNewAdvanceInput,
  type AdvanceFormState,
} from "../advanceForm";
import { toCentavos } from "../money";

function filled(overrides: Partial<AdvanceFormState> = {}): AdvanceFormState {
  return {
    ...emptyAdvanceForm("2026-03-10"),
    payee: "Juan Dela Cruz",
    particulars: "Travel advance for a Manila conference",
    amount: "15,000.00",
    ...overrides,
  };
}

describe("emptyAdvanceForm", () => {
  it("starts blank except for the given date", () => {
    const form = emptyAdvanceForm("2026-03-10");
    expect(form.dateGranted).toBe("2026-03-10");
    expect(form.payee).toBe("");
    expect(form.particulars).toBe("");
    expect(form.amount).toBe("");
  });
});

describe("advanceProblems", () => {
  it("is empty for a fully filled, valid form", () => {
    expect(advanceProblems(filled())).toEqual([]);
  });

  it("flags a blank date, payee, and particulars", () => {
    const problems = advanceProblems(filled({ dateGranted: "", payee: "", particulars: "" }));
    expect(problems).toContain("Give the date the advance was granted.");
    expect(problems).toContain("Name who the advance was granted to.");
    expect(problems).toContain("Describe what the advance is for.");
  });

  it("flags an empty or unusable amount", () => {
    expect(advanceProblems(filled({ amount: "" }))).toContain("Enter the amount granted.");
    expect(advanceProblems(filled({ amount: "not a number" }))).toContain('"not a number" is not an amount.');
  });

  it("flags a zero amount", () => {
    expect(advanceProblems(filled({ amount: "0" }))).toContain("An amount must be more than zero.");
  });
});

describe("toNewAdvanceInput", () => {
  it("converts pesos to centavos at the one boundary", () => {
    const input = toNewAdvanceInput(filled(), 3);
    expect(input).toEqual({
      barangayId: 3,
      dateGranted: "2026-03-10",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance for a Manila conference",
      amountCentavos: toCentavos(15000),
    });
  });

  it("throws rather than guessing when the form is unusable", () => {
    expect(() => toNewAdvanceInput(filled({ amount: "" }), 3)).toThrow();
    expect(() => toNewAdvanceInput(filled({ amount: "not a number" }), 3)).toThrow();
  });
});

describe("liquidationProblems", () => {
  it("is empty for a valid amount within what's outstanding", () => {
    expect(liquidationProblems("5,000.00", toCentavos(15000))).toEqual([]);
  });

  it("flags an empty or unusable amount", () => {
    expect(liquidationProblems("", toCentavos(15000))).toContain("Enter the amount liquidated.");
    expect(liquidationProblems("not a number", toCentavos(15000))).toContain('"not a number" is not an amount.');
  });

  it("flags an amount exceeding what's still outstanding", () => {
    const problems = liquidationProblems("15,000.01", toCentavos(15000));
    expect(problems).toContain("Cannot liquidate more than the ₱15,000.00 still outstanding.");
  });

  it("allows liquidating exactly the outstanding balance", () => {
    expect(liquidationProblems("15,000.00", toCentavos(15000))).toEqual([]);
  });
});

describe("toLiquidationCentavos", () => {
  it("converts a typed amount to centavos", () => {
    expect(toLiquidationCentavos("5,000.00")).toBe(toCentavos(5000));
  });

  it("throws rather than guessing when unusable", () => {
    expect(() => toLiquidationCentavos("")).toThrow();
    expect(() => toLiquidationCentavos("not a number")).toThrow();
  });
});
