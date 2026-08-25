import { describe, it, expect } from "vitest";
import {
  adjustingEntryProblems,
  bankAccountProblems,
  clearedDateProblems,
  emptyAdjustingEntryForm,
  emptyBankAccountForm,
  emptyReconciliationHeaderForm,
  emptyReconcilingItemForm,
  parseSignedAmount,
  reconciliationHeaderProblems,
  reconcilingItemProblems,
  reconcilingItemTypesForSide,
  toNewBankAccountInput,
  toNewReconcilingItemInput,
  toReconciliationHeaderCentavos,
  type BankAccountFormState,
  type ReconciliationHeaderFormState,
  type ReconcilingItemFormState,
} from "../bankReconciliationForm";
import { toCentavos } from "../money";

function filledBankAccount(overrides: Partial<BankAccountFormState> = {}): BankAccountFormState {
  return {
    ...emptyBankAccountForm(),
    bankName: "Land Bank of the Philippines",
    accountNo: "1234-5678-90",
    accountName: "General Fund",
    glAccountId: "7",
    ...overrides,
  };
}

describe("bankAccountProblems / toNewBankAccountInput", () => {
  it("is empty for a fully filled form", () => {
    expect(bankAccountProblems(filledBankAccount())).toEqual([]);
  });

  it("flags every blank field", () => {
    const problems = bankAccountProblems(filledBankAccount({ bankName: "", accountNo: "", accountName: "", glAccountId: "" }));
    expect(problems).toContain("Give the bank's name.");
    expect(problems).toContain("Give the account number.");
    expect(problems).toContain("Give the account name (e.g. General Fund).");
    expect(problems).toContain("Choose which Cash in Bank ledger account this controls.");
  });

  it("converts to the engine's input", () => {
    expect(toNewBankAccountInput(filledBankAccount(), 3)).toEqual({
      barangayId: 3,
      bankName: "Land Bank of the Philippines",
      accountNo: "1234-5678-90",
      accountName: "General Fund",
      glAccountId: 7,
    });
  });

  it("throws rather than guessing with no account chosen", () => {
    expect(() => toNewBankAccountInput(filledBankAccount({ glAccountId: "" }), 3)).toThrow();
  });
});

function filledHeader(overrides: Partial<ReconciliationHeaderFormState> = {}): ReconciliationHeaderFormState {
  return { ...emptyReconciliationHeaderForm("2024-01-31"), statementBalance: "50,000.00", ...overrides };
}

describe("reconciliationHeaderProblems / toReconciliationHeaderCentavos", () => {
  it("is empty for a fully filled, valid form", () => {
    expect(reconciliationHeaderProblems(filledHeader())).toEqual([]);
  });

  it("flags a blank statement date", () => {
    expect(reconciliationHeaderProblems(filledHeader({ statementDate: "" }))).toContain(
      "Give the bank statement's date.",
    );
  });

  it("flags an empty or unusable balance", () => {
    expect(reconciliationHeaderProblems(filledHeader({ statementBalance: "" }))).toContain(
      "Enter the statement's ending balance.",
    );
    expect(reconciliationHeaderProblems(filledHeader({ statementBalance: "not a number" }))).toContain(
      '"not a number" is not an amount.',
    );
  });

  it("flags a negative balance", () => {
    expect(reconciliationHeaderProblems(filledHeader({ statementBalance: "-500" }))).toContain(
      "A statement balance cannot be negative.",
    );
  });

  it("allows a zero balance — a brand-new account can genuinely have nothing yet", () => {
    expect(reconciliationHeaderProblems(filledHeader({ statementBalance: "0" }))).toEqual([]);
    expect(toReconciliationHeaderCentavos(filledHeader({ statementBalance: "0" }))).toBe(0);
  });

  it("converts pesos to centavos", () => {
    expect(toReconciliationHeaderCentavos(filledHeader())).toBe(toCentavos(50000));
  });
});

describe("parseSignedAmount", () => {
  it("accepts a positive amount", () => {
    expect(parseSignedAmount("500.00")).toEqual({ centavos: toCentavos(500), empty: false, message: null });
  });

  it("accepts a negative amount", () => {
    expect(parseSignedAmount("-500.00")).toEqual({ centavos: -toCentavos(500), empty: false, message: null });
  });

  it("refuses zero", () => {
    const result = parseSignedAmount("0");
    expect(result.centavos).toBeNull();
    expect(result.message).toBe("An amount cannot be zero.");
  });

  it("treats a blank field as empty, not an error", () => {
    expect(parseSignedAmount("")).toEqual({ centavos: null, empty: true, message: null });
  });

  it("refuses unparseable text", () => {
    expect(parseSignedAmount("abc").message).toBe('"abc" is not an amount.');
  });
});

describe("reconcilingItemTypesForSide", () => {
  it("offers only timing-difference categories, plus Other, for the bank side", () => {
    const types = reconcilingItemTypesForSide("bank");
    expect(types).toContain("checks_issued_not_taken_up");
    expect(types).toContain("deposit_understated");
    expect(types).toContain("other");
    expect(types).not.toContain("debit_memo");
  });

  it("offers only book-error categories, plus Other, for the book side", () => {
    const types = reconcilingItemTypesForSide("book");
    expect(types).toContain("debit_memo");
    expect(types).toContain("credit_memo");
    expect(types).toContain("prior_years_adjustment");
    expect(types).toContain("other");
    expect(types).not.toContain("checks_issued_not_taken_up");
  });
});

function filledItem(overrides: Partial<ReconcilingItemFormState> = {}): ReconcilingItemFormState {
  return { ...emptyReconcilingItemForm(), amount: "-500.00", explanation: "Check #1001 outstanding", ...overrides };
}

describe("reconcilingItemProblems / toNewReconcilingItemInput", () => {
  it("is empty for a valid signed amount", () => {
    expect(reconcilingItemProblems(filledItem())).toEqual([]);
  });

  it("flags an empty amount with guidance on the sign convention", () => {
    expect(reconcilingItemProblems(filledItem({ amount: "" }))[0]).toContain("leading minus sign");
  });

  it("flags zero", () => {
    expect(reconcilingItemProblems(filledItem({ amount: "0" }))).toContain("An amount cannot be zero.");
  });

  it("converts to the engine's input, keeping the sign", () => {
    const input = toNewReconcilingItemInput(filledItem({ side: "bank", itemType: "checks_issued_not_taken_up" }));
    expect(input).toEqual({
      side: "bank",
      itemType: "checks_issued_not_taken_up",
      amountCentavos: -toCentavos(500),
      explanation: "Check #1001 outstanding",
    });
  });

  it("omits explanation when blank, rather than sending an empty string", () => {
    const input = toNewReconcilingItemInput(filledItem({ explanation: "" }));
    expect(input.explanation).toBeUndefined();
  });

  it("throws rather than guessing when the amount is unusable", () => {
    expect(() => toNewReconcilingItemInput(filledItem({ amount: "" }))).toThrow();
  });
});

describe("adjustingEntryProblems", () => {
  it("is empty for a fully filled form", () => {
    expect(
      adjustingEntryProblems({ ...emptyAdjustingEntryForm("Adjustment"), offsetAccountId: "9" }),
    ).toEqual([]);
  });

  it("flags no account chosen and blank particulars", () => {
    const problems = adjustingEntryProblems(emptyAdjustingEntryForm(""));
    expect(problems).toContain("Choose the other account this adjustment affects.");
    expect(problems).toContain("Say what this adjustment is for.");
  });
});

describe("clearedDateProblems", () => {
  it("is empty for a valid cleared date on or after the check date", () => {
    expect(clearedDateProblems("2024-01-20", "2024-01-10")).toEqual([]);
    expect(clearedDateProblems("2024-01-10", "2024-01-10")).toEqual([]);
  });

  it("flags a blank cleared date", () => {
    expect(clearedDateProblems("", "2024-01-10")).toContain("Give the date the check cleared.");
  });

  it("flags a cleared date before the check date", () => {
    expect(clearedDateProblems("2024-01-01", "2024-01-10")).toContain(
      "A check cannot clear before it was written.",
    );
  });
});
