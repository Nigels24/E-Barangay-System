import { describe, it, expect } from "vitest";
import {
  canPost,
  emptyHeader,
  emptyLine,
  needsCheckDetails,
  parseAmount,
  toDraftLines,
  voucherProblems,
  voucherTotals,
  type VoucherHeaderForm,
  type VoucherLineForm,
} from "../voucher";

const PERIOD = { year: 2023, month: 12, status: "open" as const };

function line(over: Partial<VoucherLineForm> = {}): VoucherLineForm {
  return { key: "k", accountId: "1", side: "debit", amount: "100.00", ...over };
}

/** A voucher with nothing wrong with it, which each test then breaks one way. */
function balanced(): { header: VoucherHeaderForm; lines: VoucherLineForm[] } {
  return {
    header: {
      entryDate: "2023-12-15",
      book: "GJ",
      particulars: "Payment of electric bill",
      checkNo: "",
      checkDate: "",
    },
    lines: [
      line({ key: "a", accountId: "4", side: "debit", amount: "15931.28" }),
      line({ key: "b", accountId: "2", side: "credit", amount: "15931.28" }),
    ],
  };
}

describe("parseAmount", () => {
  it("converts typed pesos to exact centavos", () => {
    expect(parseAmount("100").centavos).toBe(10000);
    expect(parseAmount("100.5").centavos).toBe(10050);
    expect(parseAmount("15931.28").centavos).toBe(1593128);
    expect(parseAmount("2,491,080.10").centavos).toBe(249108010);
  });

  it("does not drift the way `pesos * 100` does", () => {
    // 15931.28 * 100 is 1593127.9999999998 in JavaScript. This is the entire
    // reason money.ts parses strings, and the reason this wrapper uses it.
    expect(parseAmount("15931.28").centavos).toBe(1593128);
    expect(parseAmount("7790851.41").centavos).toBe(779085141);
    expect(parseAmount("0.07").centavos).toBe(7);
    expect(parseAmount("1.005").centavos).toBe(101);
  });

  it("treats an empty field as unfilled rather than as an error", () => {
    expect(parseAmount("")).toEqual({ centavos: null, empty: true, message: null });
    expect(parseAmount("   ")).toEqual({ centavos: null, empty: true, message: null });
  });

  it("refuses text that is not an amount, and says so in words", () => {
    expect(parseAmount("abc").centavos).toBeNull();
    expect(parseAmount("abc").message).toContain("not an amount");
    expect(parseAmount("1.2.3").centavos).toBeNull();
    expect(parseAmount("100 pesos").centavos).toBeNull();
  });

  it("refuses zero and negative amounts", () => {
    // A line carries exactly one side; a negative would have to be a flipped
    // side instead, and the database's line_exactly_one_side CHECK agrees.
    expect(parseAmount("0").centavos).toBeNull();
    expect(parseAmount("0.00").centavos).toBeNull();
    expect(parseAmount("-50").centavos).toBeNull();
    expect(parseAmount("-50").message).toContain("more than zero");
  });
});

describe("voucherTotals", () => {
  it("adds each side separately and reports the difference", () => {
    const totals = voucherTotals([
      line({ side: "debit", amount: "1000" }),
      line({ side: "debit", amount: "250.50" }),
      line({ side: "credit", amount: "1250.50" }),
    ]);
    expect(totals.debitCentavos).toBe(125050);
    expect(totals.creditCentavos).toBe(125050);
    expect(totals.differenceCentavos).toBe(0);
    expect(totals.balanced).toBe(true);
  });

  it("shows the difference while a voucher is still out", () => {
    const totals = voucherTotals([
      line({ side: "debit", amount: "1000" }),
      line({ side: "credit", amount: "900" }),
    ]);
    expect(totals.differenceCentavos).toBe(10000);
    expect(totals.balanced).toBe(false);
  });

  it("is negative when credits exceed debits", () => {
    expect(
      voucherTotals([line({ side: "debit", amount: "10" }), line({ side: "credit", amount: "30" })])
        .differenceCentavos,
    ).toBe(-2000);
  });

  it("ignores blank and unreadable lines instead of collapsing to zero", () => {
    const totals = voucherTotals([
      line({ side: "debit", amount: "500" }),
      line({ side: "debit", amount: "" }),
      line({ side: "credit", amount: "oops" }),
    ]);
    expect(totals.debitCentavos).toBe(50000);
    expect(totals.creditCentavos).toBe(0);
  });

  it("is not balanced when nothing has been entered", () => {
    // Zero equals zero, but an empty voucher is not a postable one.
    const totals = voucherTotals([line({ amount: "" }), line({ amount: "" })]);
    expect(totals.differenceCentavos).toBe(0);
    expect(totals.balanced).toBe(false);
  });

  it("stays exact across many centavo amounts", () => {
    const many = Array.from({ length: 100 }, (_, i) =>
      line({ key: `k${i}`, side: "debit", amount: "0.07" }),
    );
    expect(voucherTotals(many).debitCentavos).toBe(700);
  });
});

describe("voucherProblems", () => {
  it("finds nothing wrong with a balanced two-line voucher", () => {
    const { header, lines } = balanced();
    expect(voucherProblems(header, lines, PERIOD)).toEqual([]);
    expect(canPost(header, lines, PERIOD)).toBe(true);
  });

  it("refuses a one-line voucher", () => {
    const { header, lines } = balanced();
    const problems = voucherProblems(header, [lines[0]], PERIOD);
    expect(problems.some((p) => p.includes("at least two lines"))).toBe(true);
    expect(canPost(header, [lines[0]], PERIOD)).toBe(false);
  });

  it("refuses an unbalanced voucher and names the gap in pesos", () => {
    const { header, lines } = balanced();
    lines[1].amount = "15000";
    const problems = voucherProblems(header, lines, PERIOD);
    expect(problems.some((p) => p.includes("₱931.28"))).toBe(true);
    expect(canPost(header, lines, PERIOD)).toBe(false);
  });

  it("refuses a voucher for zero", () => {
    const { header, lines } = balanced();
    lines[0].amount = "0";
    lines[1].amount = "0";
    expect(canPost(header, lines, PERIOD)).toBe(false);
  });

  it("refuses a line with no account chosen", () => {
    const { header, lines } = balanced();
    lines[1].accountId = "";
    const problems = voucherProblems(header, lines, PERIOD);
    expect(problems).toContain("Line 2: choose an account.");
  });

  it("refuses a line with no amount, naming which line", () => {
    const { header, lines } = balanced();
    lines[0].amount = "";
    expect(voucherProblems(header, lines, PERIOD)).toContain("Line 1: enter an amount.");
  });

  it("refuses empty particulars", () => {
    const { header, lines } = balanced();
    header.particulars = "   ";
    expect(canPost(header, lines, PERIOD)).toBe(false);
  });

  it("refuses a date outside the period being worked on", () => {
    const { header, lines } = balanced();
    header.entryDate = "2024-01-03";
    const problems = voucherProblems(header, lines, PERIOD);
    expect(problems.some((p) => p.includes("December 2023"))).toBe(true);

    // This mirrors postEntry's own rule; the form exists to reach it first.
    header.entryDate = "2023-12-31";
    expect(canPost(header, lines, PERIOD)).toBe(true);
  });

  it("requires check details on a CkDJ and on nothing else (D16)", () => {
    const { header, lines } = balanced();
    header.book = "CkDJ";
    const problems = voucherProblems(header, lines, PERIOD);
    expect(problems.some((p) => p.includes("check number"))).toBe(true);
    expect(problems.some((p) => p.includes("check date"))).toBe(true);
    expect(canPost(header, lines, PERIOD)).toBe(false);

    header.checkNo = "3869301";
    header.checkDate = "2023-12-02";
    expect(canPost(header, lines, PERIOD)).toBe(true);

    for (const book of ["GJ", "CRJ", "CDJ"] as const) {
      expect(needsCheckDetails(book)).toBe(false);
      expect(canPost({ ...header, book, checkNo: "", checkDate: "" }, lines, PERIOD)).toBe(true);
    }
  });

  it("reports every outstanding problem, not just the first", () => {
    const problems = voucherProblems(
      { entryDate: "", book: "CkDJ", particulars: "", checkNo: "", checkDate: "" },
      [emptyLine("a")],
      PERIOD,
    );
    expect(problems.length).toBeGreaterThan(4);
  });

  it("says nothing about balance being off when the voucher is simply empty", () => {
    const problems = voucherProblems(emptyHeader("2023-12-01"), [emptyLine("a"), emptyLine("b")], PERIOD);
    expect(problems.some((p) => p.includes("differ by"))).toBe(false);
    expect(problems.some((p) => p.includes("for zero"))).toBe(true);
  });

  it("refuses an otherwise-valid voucher when the period is closed", () => {
    const { header, lines } = balanced();
    const closedPeriod = { ...PERIOD, status: "closed" as const };
    const problems = voucherProblems(header, lines, closedPeriod);
    expect(problems.some((p) => p.includes("closed"))).toBe(true);
    expect(canPost(header, lines, closedPeriod)).toBe(false);
  });
});

describe("toDraftLines", () => {
  it("hands the engine integer centavos and one side per line", () => {
    const { lines } = balanced();
    expect(toDraftLines(lines)).toEqual([
      { accountId: 4, side: "debit", amountCentavos: 1593128 },
      { accountId: 2, side: "credit", amountCentavos: 1593128 },
    ]);
  });

  it("throws rather than quietly dropping a line it cannot convert", () => {
    const { lines } = balanced();
    lines[1].amount = "";
    expect(() => toDraftLines(lines)).toThrow(/Line 2/);

    const noAccount = balanced().lines;
    noAccount[0].accountId = "";
    expect(() => toDraftLines(noAccount)).toThrow(/Line 1/);
  });
});
