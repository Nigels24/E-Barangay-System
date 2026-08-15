import { describe, it, expect } from "vitest";
import { signedBalance } from "../display";

describe("signedBalance", () => {
  it("a positive running total is Dr", () => {
    expect(signedBalance(500000)).toEqual({ absCentavos: 500000, side: "Dr" });
  });

  it("a negative running total is Cr, magnitude restated positive", () => {
    expect(signedBalance(-500000)).toEqual({ absCentavos: 500000, side: "Cr" });
  });

  it("zero is Dr, matching trialBalance.ts's net >= 0 ? debit : credit", () => {
    expect(signedBalance(0)).toEqual({ absCentavos: 0, side: "Dr" });
  });
});
