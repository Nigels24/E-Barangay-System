import { describe, it, expect } from "vitest";
import {
  toCentavos,
  formatPeso,
  formatPesoPlain,
  centavosToPesoNumber,
  sumCentavos,
} from "../money";

describe("toCentavos", () => {
  it("converts real client figures exactly", () => {
    expect(toCentavos(2491080.1)).toBe(249108010); // beginning balance, Cash in Bank
    expect(toCentavos(15931.28)).toBe(1593128); // electric bill payment
    expect(toCentavos(76281.73)).toBe(7628173); // depreciation expense, TB2023US
    expect(toCentavos(7790851.41)).toBe(779085141); // trial balance total
  });

  it("handles the float multiplication trap directly", () => {
    // 0.29 * 100 is 28.999999999999996 in raw JS float math — Math.round
    // would still save this one case, but the string-based approach used
    // here sidesteps the whole class of error instead of patching around it.
    expect(0.29 * 100).not.toBe(29);
    expect(toCentavos(0.29)).toBe(29);
  });

  it("accepts comma-grouped strings from forms and spreadsheets", () => {
    expect(toCentavos("2,491,080.10")).toBe(249108010);
    expect(toCentavos("7,790,851.41")).toBe(779085141);
  });

  it("accepts whole pesos with no decimal part", () => {
    expect(toCentavos(100)).toBe(10000);
    expect(toCentavos("100")).toBe(10000);
  });

  it("accepts a single decimal digit as tenths", () => {
    expect(toCentavos("100.5")).toBe(10050);
  });

  it("rounds a third decimal digit to the nearest centavo", () => {
    expect(toCentavos("100.005")).toBe(10001); // rounds up
    expect(toCentavos("100.004")).toBe(10000); // rounds down
  });

  it("carries a rounding overflow into the peso part", () => {
    expect(toCentavos("100.999")).toBe(10100); // .999 rounds to 1.00, carries
  });

  it("handles negative amounts", () => {
    expect(toCentavos(-500.25)).toBe(-50025);
    expect(toCentavos("-500.25")).toBe(-50025);
  });

  it("handles zero", () => {
    expect(toCentavos(0)).toBe(0);
    expect(toCentavos("0")).toBe(0);
  });

  it("rejects garbage input instead of silently producing zero", () => {
    expect(() => toCentavos("")).toThrow();
    expect(() => toCentavos("abc")).toThrow();
    expect(() => toCentavos("12.34.56")).toThrow();
    expect(() => toCentavos("₱100")).toThrow();
    expect(() => toCentavos(NaN)).toThrow();
    expect(() => toCentavos(Infinity)).toThrow();
  });
});

describe("formatPeso", () => {
  it("formats real client figures for display", () => {
    expect(formatPeso(249108010)).toBe("₱2,491,080.10");
    expect(formatPeso(7628173)).toBe("₱76,281.73");
    expect(formatPeso(779085141)).toBe("₱7,790,851.41");
  });

  it("formats zero and small amounts", () => {
    expect(formatPeso(0)).toBe("₱0.00");
    expect(formatPeso(5)).toBe("₱0.05");
    expect(formatPeso(100)).toBe("₱1.00");
  });

  it("formats negative amounts with a leading sign before the peso symbol", () => {
    expect(formatPeso(-50025)).toBe("-₱500.25");
  });

  it("rejects non-integer input — a fractional centavo is a bug upstream", () => {
    expect(() => formatPeso(100.5)).toThrow();
  });
});

describe("formatPesoPlain", () => {
  it("formats real client figures without the peso sign", () => {
    // The client's Dec 2023 trial balance prints bare amounts — the currency
    // is stated once in the report header, not repeated on every row.
    expect(formatPesoPlain(249108010)).toBe("2,491,080.10");
    expect(formatPesoPlain(222900)).toBe("2,229.00");
    expect(formatPesoPlain(7628173)).toBe("76,281.73");
    expect(formatPesoPlain(779085141)).toBe("7,790,851.41");
  });

  it("formats zero and sub-peso amounts", () => {
    expect(formatPesoPlain(0)).toBe("0.00");
    expect(formatPesoPlain(5)).toBe("0.05");
    expect(formatPesoPlain(100)).toBe("1.00");
  });

  it("formats negative amounts with a leading sign", () => {
    expect(formatPesoPlain(-50025)).toBe("-500.25");
  });

  it("rejects non-integer input — a fractional centavo is a bug upstream", () => {
    expect(() => formatPesoPlain(100.5)).toThrow();
  });

  it("matches formatPeso apart from the symbol", () => {
    expect(formatPesoPlain(249108010)).toBe(formatPeso(249108010).replace("₱", ""));
    expect(formatPesoPlain(-50025)).toBe(formatPeso(-50025).replace("₱", ""));
  });
});

describe("round-trip", () => {
  it("toCentavos and formatPeso are inverse on real figures", () => {
    const figures = [2491080.1, 15931.28, 76281.73, 34500, 0.05];
    for (const pesos of figures) {
      const centavos = toCentavos(pesos);
      expect(centavosToPesoNumber(centavos)).toBeCloseTo(pesos, 2);
    }
  });
});

describe("sumCentavos", () => {
  it("sums an empty list to zero", () => {
    expect(sumCentavos([])).toBe(0);
  });

  it("sums the client's Jan 2023 liquidation vouchers to the posted closing entry", () => {
    // From GENERAL_JOURNAL in the prototype: 20 liquidation lines that close to Government Equity 206,945.00
    const amounts = [
      5000, 10000, 28000, 20000, 2000, 2500, 5000, 3000, 5000, 5000, 2000, 40000, 13000, 25000,
      4885, 4680, 5000, 20000, 4680, 2200,
    ].map((p) => toCentavos(p));
    expect(sumCentavos(amounts)).toBe(toCentavos(206945));
  });
});
