import type { ReconcilingItemType } from "../../db/schema";

/**
 * Turns a signed running balance into the Dr/Cr a bookkeeper actually reads
 * off a ledger page.
 *
 * `buildGeneralLedger` accumulates debit-minus-credit with no regard to the
 * account's `normalBalance` — correct arithmetic, but piped straight through
 * `formatPeso` a credit-normal account's balance prints as a bare
 * `-50,000.00`, which reads as a loss or an error, not as "a credit balance
 * of ₱50,000." The sign comes from the balance itself, not from what the
 * account was expected to do — mirroring `trialBalance.ts`'s own
 * `net >= 0 ? debit : credit` rule — so an account that has drifted to an
 * abnormal balance is visible rather than silently flipped back to what was
 * "supposed" to happen.
 */
export type BalanceSide = "Dr" | "Cr";

export interface SignedBalance {
  absCentavos: number;
  side: BalanceSide;
}

/** Zero is `Dr`, matching `trialBalance.ts`'s `net >= 0 ? debit : credit`. */
export function signedBalance(centavos: number): SignedBalance {
  return centavos < 0 ? { absCentavos: -centavos, side: "Cr" } : { absCentavos: centavos, side: "Dr" };
}

/** The fixed reconciling-item categories (D4), as a bookkeeper reads them rather than as the database stores them. */
const RECONCILING_ITEM_TYPE_LABELS: Record<ReconcilingItemType, string> = {
  checks_issued_not_taken_up: "Checks issued, not yet taken up by bank",
  checks_issued_overstated: "Checks issued, overstated",
  deposit_understated: "Deposit understated",
  deposit_overstated: "Deposit overstated",
  debit_memo: "Debit memo",
  credit_memo: "Credit memo",
  prior_years_adjustment: "Prior year's adjustment",
  other: "Other reconciling item",
};

export function reconcilingItemTypeLabel(itemType: ReconcilingItemType): string {
  return RECONCILING_ITEM_TYPE_LABELS[itemType];
}
