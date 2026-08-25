import { describe, it, expect } from "vitest";
import { createTestDb } from "../../../db/testDb";
import { account, appUser, barangay as barangayTable } from "../../../db/schema";
import { createDraftEntry, postEntry } from "../../engine/post";
import { ensurePeriod } from "../../engine/period";
import { addReconcilingItem, createBankAccount, linkAdjustingEntry, startReconciliation } from "../../engine/bankReconciliation";
import { toCentavos } from "../../money";
import { buildBankReconciliationStatement } from "../bankReconciliationStatement";

async function setUp() {
  const db = createTestDb();
  const b = await db.query.insert(barangayTable).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().get();
  const admin = await db.query
    .insert(appUser)
    .values({ username: "admin", passwordHash: "x", fullName: "Test Admin", role: "admin" })
    .returning()
    .get();
  const cashInBank = await db.query
    .insert(account)
    .values({ code: "1-01-02-010", name: "Cash in Bank", accountType: "asset", normalBalance: "debit" })
    .returning()
    .get();
  const equity = await db.query
    .insert(account)
    .values({ code: "3-01-01-010", name: "Government Equity", accountType: "equity", normalBalance: "credit" })
    .returning()
    .get();
  const period = await ensurePeriod(db, b.id, 2024, 6);
  return { db, barangay: b, admin, cashInBank, equity, period };
}

describe("buildBankReconciliationStatement", () => {
  it("is empty for a barangay with no bank accounts", async () => {
    const { db, barangay } = await setUp();
    const result = await buildBankReconciliationStatement(db, barangay.id, 2024, 6);
    expect(result.accounts).toEqual([]);
  });

  it("lists a bank account with no reconciliation yet this period as reconciliation: null", async () => {
    const { db, barangay, admin, cashInBank } = await setUp();
    await createBankAccount(db, {
      barangayId: barangay.id,
      bankName: "Land Bank of the Philippines",
      accountNo: "1234-5678-90",
      accountName: "General Fund",
      glAccountId: cashInBank.id,
      recordedBy: admin.id,
    });

    const result = await buildBankReconciliationStatement(db, barangay.id, 2024, 6);
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].reconciliation).toBeNull();
    expect(result.accounts[0].adjustedBankBalanceCentavos).toBeNull();
    expect(result.accounts[0].varianceCentavos).toBeNull();
  });

  it("computes adjusted balances and variance from the live ledger and the worksheet's items", async () => {
    const { db, barangay, admin, cashInBank, equity, period } = await setUp();
    const bankAcct = await createBankAccount(db, {
      barangayId: barangay.id,
      bankName: "Land Bank of the Philippines",
      accountNo: "1234-5678-90",
      accountName: "General Fund",
      glAccountId: cashInBank.id,
      recordedBy: admin.id,
    });

    const draft = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: period.id,
      entryDate: "2024-06-01",
      book: "GJ",
      particulars: "Opening balance",
      createdBy: admin.id,
      lines: [
        { accountId: cashInBank.id, side: "debit", amountCentavos: toCentavos(10000) },
        { accountId: equity.id, side: "credit", amountCentavos: toCentavos(10000) },
      ],
    });
    await postEntry(db, { entryId: draft.id, postedBy: admin.id });

    const recon = await startReconciliation(db, {
      bankAccountId: bankAcct.id,
      periodId: period.id,
      statementDate: "2024-06-30",
      statementBalanceCentavos: toCentavos(9500),
      bookBalanceCentavos: toCentavos(10000),
      preparedBy: admin.id,
    });
    await addReconcilingItem(db, {
      reconciliationId: recon.id,
      side: "bank",
      itemType: "checks_issued_not_taken_up",
      amountCentavos: -toCentavos(500),
      recordedBy: admin.id,
    });

    const result = await buildBankReconciliationStatement(db, barangay.id, 2024, 6);
    const statement = result.accounts[0];
    expect(statement.reconciliation?.bookBalanceCentavos).toBe(toCentavos(10000));
    expect(statement.adjustedBankBalanceCentavos).toBe(toCentavos(9000));
    expect(statement.adjustedBookBalanceCentavos).toBe(toCentavos(10000));
    expect(statement.varianceCentavos).toBe(toCentavos(9000) - toCentavos(10000));
    expect(statement.items).toHaveLength(1);
  });

  it("does not double-count a book-side item once its adjusting entry has posted", async () => {
    const { db, barangay, admin, cashInBank, equity, period } = await setUp();
    const bankAcct = await createBankAccount(db, {
      barangayId: barangay.id,
      bankName: "Land Bank of the Philippines",
      accountNo: "1234-5678-90",
      accountName: "General Fund",
      glAccountId: cashInBank.id,
      recordedBy: admin.id,
    });
    const recon = await startReconciliation(db, {
      bankAccountId: bankAcct.id,
      periodId: period.id,
      statementDate: "2024-06-30",
      statementBalanceCentavos: toCentavos(0),
      bookBalanceCentavos: toCentavos(0),
      preparedBy: admin.id,
    });
    const item = await addReconcilingItem(db, {
      reconciliationId: recon.id,
      side: "book",
      itemType: "credit_memo",
      amountCentavos: toCentavos(200),
      explanation: "Interest credited",
      recordedBy: admin.id,
    });

    // Post the real adjusting voucher and link it, the way postAdjustingEntryAction does.
    const draft = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: period.id,
      entryDate: "2024-06-30",
      book: "GJ",
      particulars: "Interest credited by the bank",
      createdBy: admin.id,
      lines: [
        { accountId: cashInBank.id, side: "debit", amountCentavos: toCentavos(200) },
        { accountId: equity.id, side: "credit", amountCentavos: toCentavos(200) },
      ],
    });
    const posted = await postEntry(db, { entryId: draft.id, postedBy: admin.id });
    await linkAdjustingEntry(db, { reconcilingItemId: item.id, entryId: posted.id, linkedBy: admin.id });

    const result = await buildBankReconciliationStatement(db, barangay.id, 2024, 6);
    const statement = result.accounts[0];
    // Live ledger already reflects the +200; the item must not be added again.
    expect(statement.adjustedBookBalanceCentavos).toBe(toCentavos(200));
  });

  it("excludes another barangay's bank accounts", async () => {
    const { db, barangay, admin, cashInBank } = await setUp();
    const other = await db.query.insert(barangayTable).values({ code: "OTH", name: "Barangay Other" }).returning().get();
    await createBankAccount(db, {
      barangayId: other.id,
      bankName: "Other Bank",
      accountNo: "999",
      accountName: "Other Fund",
      glAccountId: cashInBank.id,
      recordedBy: admin.id,
    });

    const result = await buildBankReconciliationStatement(db, barangay.id, 2024, 6);
    expect(result.accounts).toEqual([]);
  });

  it("reports as of the period's own end date", async () => {
    const { db, barangay } = await setUp();
    const result = await buildBankReconciliationStatement(db, barangay.id, 2024, 6);
    expect(result.asOfDate).toBe("2024-06-30");
  });
});
