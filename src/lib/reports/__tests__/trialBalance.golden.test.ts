/**
 * The golden test for the whole reporting layer.
 *
 * TB2023US.xlsx, sheet "dec" — Barangay Upper Sibatang's actual, filed
 * Trial Balance as of December 31, 2023 — balances to the centavo:
 * total debit = total credit = ₱7,790,851.41 across 46 accounts. That
 * balance was independently verified straight out of the client's own
 * workbook with openpyxl before any of this code existed.
 *
 * This test enters that exact trial balance into the engine as a single
 * balanced "opening balance conversion" voucher — the standard, real
 * bookkeeping technique for bringing an existing set of books into a new
 * system — dated 2023-12-31, then asks buildTrialBalance to reconstruct it.
 * If the report doesn't reproduce every one of the client's own 46 figures
 * exactly, the engine is wrong, full stop.
 *
 * The chart of accounts itself comes from the real seed module
 * (src/db/seed/accounts.ts) rather than a second hand-typed copy — this
 * test validates the ACTUAL seed data the app will ship with, not a
 * parallel fixture that could quietly drift out of sync with it.
 *
 * Five accounts in the client's real December 2023 TB have no account code
 * at all, and one code (5-02-01-010) is shared by two different accounts —
 * both are real defects in the client's own workbook, catalogued in
 * docs/decisions.md D12, and NOT YET resolved with the City Accountant.
 * The seed module marks its five placeholder codes `isProvisionalCode`.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createTestDb } from "../../../db/testDb";
import { createDraftEntry, postEntry } from "../../engine/post";
import { ensurePeriod } from "../../engine/period";
import { toCentavos } from "../../money";
import { account, appUser, barangay } from "../../../db/schema";
import { seedAccounts, CHART_OF_ACCOUNTS_SEED } from "../../../db/seed/accounts";
import { buildTrialBalance } from "../trialBalance";

function seedBarangayAndAdmin() {
  const db = createTestDb();
  const b = db.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().get();
  const admin = db
    .insert(appUser)
    .values({ username: "admin", passwordHash: "x", fullName: "Peter Paul Cotingjo", role: "admin" })
    .returning()
    .get();
  return { db, barangay: b, admin };
}

// Exactly as filed, TB2023US.xlsx "dec" sheet. side: "D" = debit balance, "C" = credit balance.
// Codes here must match CHART_OF_ACCOUNTS_SEED exactly — checked below —
// so this is genuinely "the real seed chart, with the client's real
// year-end balances attached", not a second independent account list.
const DEC_2023_TRIAL_BALANCE = [
  { code: "1-01-01-010", name: "Cash in Local Treasury", side: "D", pesos: 2229.0 },
  { code: "1-01-02-010", name: "Cash in Bank", side: "D", pesos: 2491080.1 },
  { code: "1-03-02-010", name: "Due from Local Government Units", side: "D", pesos: 13228.15 },
  { code: "1-03-03-020", name: "Advances to Officers and Employees", side: "D", pesos: 34920.0 },
  { code: "1-07-03-040", name: "Water Supply Systems", side: "D", pesos: 511625.0 },
  { code: "1-07-03-041", name: "Accumulated Depreciation - Water Supply Systems", side: "C", pesos: 51841.56 },
  { code: "1-07-04-010", name: "Buildings", side: "D", pesos: 608144.8 },
  { code: "1-07-04-011", name: "Accumulated Depreciation - Buildings", side: "C", pesos: 124482.94 },
  { code: "1-07-04-990", name: "Other Structures", side: "D", pesos: 871918.71 },
  { code: "1-07-04-991", name: "Accumulated Depreciation - Other Structures", side: "C", pesos: 358509.34 },
  { code: "1-07-05-020", name: "Office Equipment", side: "D", pesos: 107088.22 },
  { code: "1-07-05-021", name: "Accumulated Depreciation - Office Equipment", side: "C", pesos: 68794.7 },
  { code: "1-07-05-030", name: "Information and Communication Equipment", side: "D", pesos: 35000.0 },
  { code: "1-07-05-031", name: "Accumulated Depreciation - Information and Communication", side: "C", pesos: 12375.0 },
  { code: "1-07-05-990", name: "Other Machinery and Equipment", side: "D", pesos: 87784.51 },
  { code: "1-07-05-991", name: "Accumulated Depreciation - Other Machinery and Equipment", side: "C", pesos: 60428.04 },
  { code: "1-07-05-060", name: "Disaster Response & Rescue Equipment", side: "D", pesos: 96000.0 },
  { code: "PENDING-ACCUM-DEP-DRRE", name: "Accumulated Depreciation (Disaster Response & Rescue Equipment)", side: "C", pesos: 6840.0 },
  { code: "1-07-07-010", name: "Furnitures and Fixtures", side: "D", pesos: 75875.7 },
  { code: "1-07-07-011", name: "Accumulated Depreciation - Furnitures and Fixtures", side: "C", pesos: 72740.46 },
  { code: "2-02-01-010", name: "Due to BIR - VAT", side: "D", pesos: 6718.17 },
  { code: "2-02-01-010A", name: "Due to BIR - Documentary Stamp", side: "C", pesos: 2010.0 },
  { code: "3-01-01-010", name: "Government Equity", side: "C", pesos: 4224261.49 },
  { code: "4-01-01-010", name: "Real Property Tax", side: "C", pesos: 170827.88 },
  { code: "PENDING-COMMUNITY-TAX", name: "Community Tax", side: "C", pesos: 4440.0 },
  { code: "4-04-04-010", name: "Share from IRA", side: "C", pesos: 2521900.0 },
  { code: "4-02-01-020", name: "Subsidy from LGU's", side: "C", pesos: 35000.0 },
  { code: "4-04-01-010", name: "Clearance and Certificate Fees", side: "C", pesos: 38090.0 },
  { code: "4-04-02-990", name: "Other Business Income", side: "C", pesos: 38310.0 },
  { code: "5-01-02-050", name: "Honoraria", side: "D", pesos: 1221792.0 },
  { code: "PENDING-YEAR-END-BONUS", name: "Year End Bonus", side: "D", pesos: 34500.0 },
  { code: "5-01-02-070", name: "Cash Gift", side: "D", pesos: 27500.0 },
  { code: "5-01-02-990", name: "Other Bonuses and Allowances", side: "D", pesos: 160800.0 },
  { code: "5-01-04-010", name: "Terminal Leave Benefits", side: "D", pesos: 139035.0 },
  { code: "5-02-01-010", name: "Travelling Expense", side: "D", pesos: 800.0 },
  { code: "5-02-02-010", name: "Training Expense", side: "D", pesos: 111816.16 },
  { code: "5-02-03-010", name: "Office Supplies Expense", side: "D", pesos: 56000.0 },
  { code: "5-02-04-020", name: "Electricity Expense", side: "D", pesos: 116024.23 },
  { code: "5-02-03-020", name: "Accountable Forms", side: "D", pesos: 1972.25 },
  { code: "5-02-11-020", name: "Auditing Services Expense", side: "D", pesos: 4000.0 },
  { code: "5-02-09-020", name: "R&M Infrastructure Assets", side: "D", pesos: 150000.0 },
  { code: "5-02-11-010", name: "Fidelity Bond Premiums", side: "D", pesos: 2151.0 },
  { code: "5-02-99-050", name: "Membership Dues & Contribution", side: "D", pesos: 4000.0 },
  { code: "5-02-99-990", name: "Other Maintenance & Operation Expense", side: "D", pesos: 326500.0 },
  { code: "PENDING-SK-TRANSFER", name: "Transfer of SK Allocation", side: "D", pesos: 416066.68 },
  { code: "PENDING-DEPRECIATION-EXP", name: "Depreciation Expense", side: "D", pesos: 76281.73 },
] as const;

describe("the golden fixture's codes match the real seed chart of accounts exactly", () => {
  it("every code in this test exists in CHART_OF_ACCOUNTS_SEED, and vice versa", () => {
    const golden = new Set(DEC_2023_TRIAL_BALANCE.map((r) => r.code));
    const seed = new Set(CHART_OF_ACCOUNTS_SEED.map((a) => a.code));
    expect([...golden].sort()).toEqual([...seed].sort());
  });
});

const EXPECTED_TOTAL_PESOS = 7790851.41;

describe("Trial Balance golden test — Barangay Upper Sibatang, December 31, 2023", () => {
  it("the source data itself balances to the centavo (sanity check before touching the engine)", () => {
    const totalDebit = DEC_2023_TRIAL_BALANCE.filter((r) => r.side === "D").reduce((s, r) => s + toCentavos(r.pesos), 0);
    const totalCredit = DEC_2023_TRIAL_BALANCE.filter((r) => r.side === "C").reduce((s, r) => s + toCentavos(r.pesos), 0);
    expect(totalDebit).toBe(toCentavos(EXPECTED_TOTAL_PESOS));
    expect(totalCredit).toBe(toCentavos(EXPECTED_TOTAL_PESOS));
  });

  function setUpAndPost() {
    const fixture = seedBarangayAndAdmin();
    const { db, barangay, admin } = fixture;

    seedAccounts(db);
    const accountsByCode = new Map(
      db.select().from(account).all().map((a) => [a.code, a] as const),
    );

    const dec2023 = ensurePeriod(db, barangay.id, 2023, 12);
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: dec2023.id,
      entryDate: "2023-12-31",
      book: "GJ",
      particulars: "Opening balance conversion — trial balance as filed, December 31, 2023",
      createdBy: admin.id,
      lines: DEC_2023_TRIAL_BALANCE.map((row) => ({
        accountId: accountsByCode.get(row.code)!.id,
        side: row.side === "D" ? "debit" : ("credit" as const),
        amountCentavos: toCentavos(row.pesos),
      })),
    });

    return { fixture, draft };
  }

  it("posts the client's entire December 2023 trial balance as one balanced voucher", () => {
    const { fixture, draft } = setUpAndPost();
    const posted = postEntry(fixture.db, { entryId: draft.id, postedBy: fixture.admin.id });
    expect(posted.status).toBe("posted");
  });

  describe("buildTrialBalance reproduces it exactly", () => {
    let result: ReturnType<typeof buildTrialBalance>;

    beforeAll(() => {
      const { fixture, draft } = setUpAndPost();
      postEntry(fixture.db, { entryId: draft.id, postedBy: fixture.admin.id });
      result = buildTrialBalance(fixture.db, fixture.barangay.id, 2023, 12);
    });

    it("totals exactly ₱7,790,851.41 on both sides", () => {
      expect(result.totalDebitCentavos).toBe(toCentavos(EXPECTED_TOTAL_PESOS));
      expect(result.totalCreditCentavos).toBe(toCentavos(EXPECTED_TOTAL_PESOS));
    });

    it("reports the correct number of accounts with a balance", () => {
      expect(result.rows).toHaveLength(DEC_2023_TRIAL_BALANCE.length);
    });

    it.each(DEC_2023_TRIAL_BALANCE)("matches the client's own figure for $name ($code) row by row", (expectedRow) => {
      const row = result.rows.find((r) => r.code === expectedRow.code);
      expect(row).toBeDefined();
      if (expectedRow.side === "D") {
        expect(row!.debitCentavos).toBe(toCentavos(expectedRow.pesos));
        expect(row!.creditCentavos).toBe(0);
      } else {
        expect(row!.creditCentavos).toBe(toCentavos(expectedRow.pesos));
        expect(row!.debitCentavos).toBe(0);
      }
    });

    it("as of an earlier month, the December entry has not happened yet", () => {
      const { fixture, draft } = setUpAndPost();
      postEntry(fixture.db, { entryId: draft.id, postedBy: fixture.admin.id });
      const november = buildTrialBalance(fixture.db, fixture.barangay.id, 2023, 11);
      expect(november.rows).toHaveLength(0);
      expect(november.totalDebitCentavos).toBe(0);
    });
  });
});
