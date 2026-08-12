/**
 * Chart of accounts seed data.
 *
 * These are the exact 46 accounts appearing in Barangay Upper Sibatang's
 * real, filed Trial Balance as of December 31, 2023 (TB2023US.xlsx, sheet
 * "dec") — independently verified against the client's own workbook before
 * any of this code existed, and reproduced to the centavo by the golden
 * test in src/lib/reports/__tests__/trialBalance.golden.test.ts, which
 * imports this exact list rather than keeping a second copy.
 *
 * Per docs/decisions.md:
 *   D9  — ONE chart of accounts, shared by all barangays (no barangayId
 *         on the account table).
 *   D12 — a code may never mean two accounts. The client's real books had
 *         a collision (5-02-01-010 used for both Travelling Expense and
 *         Auditing Services Expense) and five accounts with no code at
 *         all. Both are resolved below using the specific proposals
 *         already recorded in decisions.md — five of them are still
 *         PENDING confirmation from the City Accountant and are marked
 *         `isProvisionalCode: true`, which a report builder must check
 *         before printing any official document.
 *
 * NOT YET SEEDED: the complete Revised Chart of Accounts for LGUs (D10).
 * Only accounts independently verified against the client's real source
 * files are included here. Expanding to the full standard chart needs an
 * authoritative digital copy of the COA circular from the client — it is
 * deliberately not reconstructed from memory, because a wrong official
 * government account code is worse than a missing one.
 */
import { account, type AccountType, type NormalBalance } from "../schema";
import type { EngineDb } from "../../lib/engine/types";

/**
 * Named handles for the five placeholder codes, so the golden test and
 * this seed module reference the exact same strings instead of two
 * separately-typed copies that could silently drift apart.
 */
export const PENDING_ACCOUNT_CODES = {
  ACCUM_DEP_DISASTER_RESPONSE: "PENDING-ACCUM-DEP-DRRE",
  COMMUNITY_TAX: "PENDING-COMMUNITY-TAX",
  YEAR_END_BONUS: "PENDING-YEAR-END-BONUS",
  SK_TRANSFER: "PENDING-SK-TRANSFER",
  DEPRECIATION_EXPENSE: "PENDING-DEPRECIATION-EXP",
} as const;

export interface SeedAccount {
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  /** True when `code` is a placeholder awaiting confirmation — see decisions.md D12. */
  pending?: boolean;
}

export const CHART_OF_ACCOUNTS_SEED: readonly SeedAccount[] = [
  { code: "1-01-01-010", name: "Cash in Local Treasury", accountType: "asset", normalBalance: "debit" },
  { code: "1-01-02-010", name: "Cash in Bank", accountType: "asset", normalBalance: "debit" },
  { code: "1-03-02-010", name: "Due from Local Government Units", accountType: "asset", normalBalance: "debit" },
  { code: "1-03-03-020", name: "Advances to Officers and Employees", accountType: "asset", normalBalance: "debit" },
  { code: "1-07-03-040", name: "Water Supply Systems", accountType: "asset", normalBalance: "debit" },
  { code: "1-07-03-041", name: "Accumulated Depreciation - Water Supply Systems", accountType: "asset", normalBalance: "credit" },
  { code: "1-07-04-010", name: "Buildings", accountType: "asset", normalBalance: "debit" },
  { code: "1-07-04-011", name: "Accumulated Depreciation - Buildings", accountType: "asset", normalBalance: "credit" },
  { code: "1-07-04-990", name: "Other Structures", accountType: "asset", normalBalance: "debit" },
  { code: "1-07-04-991", name: "Accumulated Depreciation - Other Structures", accountType: "asset", normalBalance: "credit" },
  { code: "1-07-05-020", name: "Office Equipment", accountType: "asset", normalBalance: "debit" },
  { code: "1-07-05-021", name: "Accumulated Depreciation - Office Equipment", accountType: "asset", normalBalance: "credit" },
  { code: "1-07-05-030", name: "Information and Communication Equipment", accountType: "asset", normalBalance: "debit" },
  { code: "1-07-05-031", name: "Accumulated Depreciation - Information and Communication", accountType: "asset", normalBalance: "credit" },
  { code: "1-07-05-990", name: "Other Machinery and Equipment", accountType: "asset", normalBalance: "debit" },
  { code: "1-07-05-991", name: "Accumulated Depreciation - Other Machinery and Equipment", accountType: "asset", normalBalance: "credit" },
  { code: "1-07-05-060", name: "Disaster Response & Rescue Equipment", accountType: "asset", normalBalance: "debit" },
  {
    code: PENDING_ACCOUNT_CODES.ACCUM_DEP_DISASTER_RESPONSE,
    name: "Accumulated Depreciation (Disaster Response & Rescue Equipment)",
    accountType: "asset",
    normalBalance: "credit",
    pending: true,
  },
  { code: "1-07-07-010", name: "Furnitures and Fixtures", accountType: "asset", normalBalance: "debit" },
  { code: "1-07-07-011", name: "Accumulated Depreciation - Furnitures and Fixtures", accountType: "asset", normalBalance: "credit" },
  { code: "2-02-01-010", name: "Due to BIR - VAT", accountType: "liability", normalBalance: "credit" },
  { code: "2-02-01-010A", name: "Due to BIR - Documentary Stamp", accountType: "liability", normalBalance: "credit" },
  { code: "3-01-01-010", name: "Government Equity", accountType: "equity", normalBalance: "credit" },
  { code: "4-01-01-010", name: "Real Property Tax", accountType: "income", normalBalance: "credit" },
  { code: PENDING_ACCOUNT_CODES.COMMUNITY_TAX, name: "Community Tax", accountType: "income", normalBalance: "credit", pending: true },
  { code: "4-04-04-010", name: "Share from IRA", accountType: "income", normalBalance: "credit" },
  { code: "4-02-01-020", name: "Subsidy from LGU's", accountType: "income", normalBalance: "credit" },
  { code: "4-04-01-010", name: "Clearance and Certificate Fees", accountType: "income", normalBalance: "credit" },
  { code: "4-04-02-990", name: "Other Business Income", accountType: "income", normalBalance: "credit" },
  { code: "5-01-02-050", name: "Honoraria", accountType: "expense", normalBalance: "debit" },
  { code: PENDING_ACCOUNT_CODES.YEAR_END_BONUS, name: "Year End Bonus", accountType: "expense", normalBalance: "debit", pending: true },
  { code: "5-01-02-070", name: "Cash Gift", accountType: "expense", normalBalance: "debit" },
  { code: "5-01-02-990", name: "Other Bonuses and Allowances", accountType: "expense", normalBalance: "debit" },
  { code: "5-01-04-010", name: "Terminal Leave Benefits", accountType: "expense", normalBalance: "debit" },
  { code: "5-02-01-010", name: "Travelling Expense", accountType: "expense", normalBalance: "debit" },
  { code: "5-02-02-010", name: "Training Expense", accountType: "expense", normalBalance: "debit" },
  { code: "5-02-03-010", name: "Office Supplies Expense", accountType: "expense", normalBalance: "debit" },
  { code: "5-02-04-020", name: "Electricity Expense", accountType: "expense", normalBalance: "debit" },
  { code: "5-02-03-020", name: "Accountable Forms", accountType: "expense", normalBalance: "debit" },
  // Real duplicate in the client's own books: 5-02-01-010 is used for both
  // this account and Travelling Expense above. Proposed resolution from
  // decisions.md D12 (medium confidence): 5-02-11-020, beside Fidelity Bond
  // Premiums. Marked pending until the City Accountant confirms.
  { code: "5-02-11-020", name: "Auditing Services Expense", accountType: "expense", normalBalance: "debit", pending: true },
  { code: "5-02-09-020", name: "R&M Infrastructure Assets", accountType: "expense", normalBalance: "debit" },
  { code: "5-02-11-010", name: "Fidelity Bond Premiums", accountType: "expense", normalBalance: "debit" },
  { code: "5-02-99-050", name: "Membership Dues & Contribution", accountType: "expense", normalBalance: "debit" },
  { code: "5-02-99-990", name: "Other Maintenance & Operation Expense", accountType: "expense", normalBalance: "debit" },
  { code: PENDING_ACCOUNT_CODES.SK_TRANSFER, name: "Transfer of SK Allocation", accountType: "expense", normalBalance: "debit", pending: true },
  { code: PENDING_ACCOUNT_CODES.DEPRECIATION_EXPENSE, name: "Depreciation Expense", accountType: "expense", normalBalance: "debit", pending: true },
] as const;

/**
 * Inserts every seed account not already present (matched by code), so
 * running this against a database that already has some or all of these
 * rows is always safe — it never duplicates and never errors.
 */
export function seedAccounts(db: EngineDb) {
  const existingCodes = new Set(
    db.select({ code: account.code }).from(account).all().map((r) => r.code),
  );
  const toInsert = CHART_OF_ACCOUNTS_SEED.filter((a) => !existingCodes.has(a.code));
  if (toInsert.length === 0) return [];

  return db
    .insert(account)
    .values(
      toInsert.map((a) => ({
        code: a.code,
        name: a.name,
        accountType: a.accountType,
        normalBalance: a.normalBalance,
        isProvisionalCode: a.pending ?? false,
      })),
    )
    .returning()
    .all();
}
