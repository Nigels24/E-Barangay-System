import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "../../engine/__tests__/fixtures";
import { seedPlaceholderUser } from "../../../db/seed/users";
import { toCentavos } from "../../money";
import {
  addReconcilingItemAction,
  createBankAccountAction,
  deriveOutstandingChecks,
  finalizeReconciliationAction,
  getReconciliationWorksheet,
  listBankAccounts,
  listBankGlAccounts,
  markCheckClearedAction,
  postAdjustingEntryAction,
  startReconciliationAction,
  updateReconciliationHeaderAction,
  type WorksheetContext,
} from "../bankReconciliation";
import { postNewVoucher } from "../journal";

async function seedForWrites() {
  const fixture = await seedEngineFixture();
  await seedPlaceholderUser(fixture.db);
  return fixture;
}

describe("listBankGlAccounts", () => {
  it("offers only the Cash in Bank (1-01-02-) accounts", async () => {
    const fixture = await seedForWrites();
    const options = await listBankGlAccounts(fixture.db);
    expect(options.some((o) => o.code === "1-01-02-010")).toBe(true);
    for (const o of options) expect(o.code.startsWith("1-01-02-")).toBe(true);
  });

  it("does not offer Cash in Local Treasury", async () => {
    const fixture = await seedForWrites();
    const options = await listBankGlAccounts(fixture.db);
    expect(options.some((o) => o.code === "1-01-01-010")).toBe(false);
  });
});

describe("createBankAccountAction / listBankAccounts", () => {
  it("adds a bank account, resolving the placeholder actor (D32) without a screen ever passing one", async () => {
    const fixture = await seedForWrites();

    await createBankAccountAction(fixture.db, {
      barangayId: fixture.barangay.id,
      bankName: "Land Bank of the Philippines",
      accountNo: "1234-5678-90",
      accountName: "General Fund",
      glAccountId: fixture.accounts.cashInBank.id,
    });

    const rows = await listBankAccounts(fixture.db, fixture.barangay.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].bankName).toBe("Land Bank of the Philippines");
    expect(rows[0].glAccountCode).toBe("1-01-02-010");
  });
});

async function seedBankAccountAndContext(fixture: Awaited<ReturnType<typeof seedForWrites>>): Promise<WorksheetContext> {
  const created = await createBankAccountAction(fixture.db, {
    barangayId: fixture.barangay.id,
    bankName: "Land Bank of the Philippines",
    accountNo: "1234-5678-90",
    accountName: "General Fund",
    glAccountId: fixture.accounts.cashInBank.id,
  });
  return {
    bankAccountId: created.id,
    periodId: fixture.periods.jan2024.id,
    barangayId: fixture.barangay.id,
    glAccountId: fixture.accounts.cashInBank.id,
    year: 2024,
    month: 1,
  };
}

describe("getReconciliationWorksheet", () => {
  it("is null before a reconciliation is started", async () => {
    const fixture = await seedForWrites();
    const context = await seedBankAccountAndContext(fixture);
    expect(await getReconciliationWorksheet(fixture.db, context)).toBeNull();
  });
});

describe("startReconciliationAction", () => {
  it("captures the live ledger balance as the starting book balance", async () => {
    const fixture = await seedForWrites();
    const context = await seedBankAccountAndContext(fixture);

    await postNewVoucher(fixture.db, {
      barangayId: fixture.barangay.id,
      periodId: fixture.periods.jan2024.id,
      entryDate: "2024-01-05",
      book: "CRJ",
      particulars: "Collection deposited",
      lines: [
        { accountId: fixture.accounts.cashInBank.id, side: "debit", amountCentavos: toCentavos(10000) },
        { accountId: fixture.accounts.ira.id, side: "credit", amountCentavos: toCentavos(10000) },
      ],
    });

    const worksheet = await startReconciliationAction(fixture.db, {
      context,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(9500),
    });

    expect(worksheet.liveBookBalanceCentavos).toBe(toCentavos(10000));
    expect(worksheet.reconciliation.bookBalanceCentavos).toBe(toCentavos(10000));
    expect(worksheet.varianceCentavos).toBe(toCentavos(9500) - toCentavos(10000));
  });
});

describe("updateReconciliationHeaderAction", () => {
  it("corrects a typo in the statement balance", async () => {
    const fixture = await seedForWrites();
    const context = await seedBankAccountAndContext(fixture);
    const started = await startReconciliationAction(fixture.db, {
      context,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(5000),
    });

    const updated = await updateReconciliationHeaderAction(fixture.db, {
      context,
      reconciliationId: started.reconciliation.id,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(50000),
    });
    expect(updated.reconciliation.statementBalanceCentavos).toBe(toCentavos(50000));
  });
});

describe("addReconcilingItemAction", () => {
  it("folds a bank-side item into the adjusted bank balance and a book-side item into the adjusted book balance", async () => {
    const fixture = await seedForWrites();
    const context = await seedBankAccountAndContext(fixture);
    const started = await startReconciliationAction(fixture.db, {
      context,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(10000),
    });

    let worksheet = await addReconcilingItemAction(fixture.db, {
      context,
      reconciliationId: started.reconciliation.id,
      side: "bank",
      itemType: "checks_issued_not_taken_up",
      amountCentavos: -toCentavos(500),
      explanation: "Check #1001 outstanding",
    });
    expect(worksheet.adjustedBankBalanceCentavos).toBe(toCentavos(9500));

    worksheet = await addReconcilingItemAction(fixture.db, {
      context,
      reconciliationId: started.reconciliation.id,
      side: "book",
      itemType: "debit_memo",
      amountCentavos: -toCentavos(150),
      explanation: "Bank service charge",
    });
    expect(worksheet.adjustedBookBalanceCentavos).toBe(toCentavos(0) - toCentavos(150));
    expect(worksheet.items).toHaveLength(2);
  });
});

async function postCheck(
  fixture: Awaited<ReturnType<typeof seedForWrites>>,
  overrides: { checkNo: string; checkDate: string; amount: number },
) {
  return postNewVoucher(fixture.db, {
    barangayId: fixture.barangay.id,
    periodId: fixture.periods.jan2024.id,
    entryDate: overrides.checkDate,
    book: "CkDJ",
    particulars: "Payment of office supplies",
    checkNo: overrides.checkNo,
    checkDate: overrides.checkDate,
    lines: [
      { accountId: fixture.accounts.electricity.id, side: "debit", amountCentavos: toCentavos(overrides.amount) },
      { accountId: fixture.accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(overrides.amount) },
    ],
  });
}

describe("deriveOutstandingChecks", () => {
  it("lists a posted, uncleared check as of a date on or after it was issued", async () => {
    const fixture = await seedForWrites();
    await postCheck(fixture, { checkNo: "0001234", checkDate: "2024-01-10", amount: 1000 });

    const rows = await deriveOutstandingChecks(fixture.db, fixture.barangay.id, fixture.accounts.cashInBank.id, "2024-01-31");
    expect(rows).toHaveLength(1);
    expect(rows[0].checkNo).toBe("0001234");
    expect(rows[0].amountCentavos).toBe(toCentavos(1000));
  });

  it("excludes a check issued after the as-of date", async () => {
    const fixture = await seedForWrites();
    await postCheck(fixture, { checkNo: "0001234", checkDate: "2024-01-20", amount: 1000 });

    const rows = await deriveOutstandingChecks(fixture.db, fixture.barangay.id, fixture.accounts.cashInBank.id, "2024-01-10");
    expect(rows).toEqual([]);
  });

  it("excludes a check already marked cleared as of the as-of date", async () => {
    const fixture = await seedForWrites();
    const posted = await postCheck(fixture, { checkNo: "0001234", checkDate: "2024-01-10", amount: 1000 });
    await markCheckClearedAction(fixture.db, { entryId: posted.entryId, clearedDate: "2024-01-15" });

    const rows = await deriveOutstandingChecks(fixture.db, fixture.barangay.id, fixture.accounts.cashInBank.id, "2024-01-31");
    expect(rows).toEqual([]);
  });

  it("still lists a check that cleared after the as-of date", async () => {
    const fixture = await seedForWrites();
    const posted = await postCheck(fixture, { checkNo: "0001234", checkDate: "2024-01-10", amount: 1000 });
    await markCheckClearedAction(fixture.db, { entryId: posted.entryId, clearedDate: "2024-02-05" });

    const rows = await deriveOutstandingChecks(fixture.db, fixture.barangay.id, fixture.accounts.cashInBank.id, "2024-01-31");
    expect(rows).toHaveLength(1);
  });

  it("excludes a check already claimed by a reconciling item", async () => {
    const fixture = await seedForWrites();
    const context = await seedBankAccountAndContext(fixture);
    const posted = await postCheck(fixture, { checkNo: "0001234", checkDate: "2024-01-10", amount: 1000 });
    const started = await startReconciliationAction(fixture.db, {
      context,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(9000),
    });
    await addReconcilingItemAction(fixture.db, {
      context,
      reconciliationId: started.reconciliation.id,
      side: "bank",
      itemType: "checks_issued_not_taken_up",
      amountCentavos: -toCentavos(1000),
      relatedEntryId: posted.entryId,
    });

    const rows = await deriveOutstandingChecks(fixture.db, fixture.barangay.id, fixture.accounts.cashInBank.id, "2024-01-31");
    expect(rows).toEqual([]);
  });
});

describe("postAdjustingEntryAction", () => {
  it("posts a real two-line voucher for a positive (book balance increases) item and links it", async () => {
    const fixture = await seedForWrites();
    const context = await seedBankAccountAndContext(fixture);
    const started = await startReconciliationAction(fixture.db, {
      context,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(10000),
    });
    const withItem = await addReconcilingItemAction(fixture.db, {
      context,
      reconciliationId: started.reconciliation.id,
      side: "book",
      itemType: "credit_memo",
      amountCentavos: toCentavos(200),
      explanation: "Interest credited by the bank",
    });
    const item = withItem.items[0];

    const { worksheet, posted } = await postAdjustingEntryAction(fixture.db, {
      context,
      reconcilingItemId: item.id,
      itemAmountCentavos: item.amountCentavos,
      entryDate: "2024-01-31",
      particulars: "Bank reconciliation adjustment — interest credited",
      offsetAccountId: fixture.accounts.ira.id,
    });

    expect(posted.jevNo).toBeTruthy();
    expect(worksheet.liveBookBalanceCentavos).toBe(toCentavos(200));
    expect(worksheet.items[0].adjustingEntryId).toBe(posted.entryId);
    // The item's own +200 must NOT be added a second time on top of the live
    // balance, which already includes it now that it is posted — otherwise
    // the adjusted book balance would double-count it.
    expect(worksheet.adjustedBookBalanceCentavos).toBe(toCentavos(200));
  });

  it("posts the opposite sides for a negative (book balance decreases) item", async () => {
    const fixture = await seedForWrites();
    const context = await seedBankAccountAndContext(fixture);
    const started = await startReconciliationAction(fixture.db, {
      context,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(10000),
    });
    // Give the account an opening balance so a credit for the service charge has something to draw down.
    await postNewVoucher(fixture.db, {
      barangayId: fixture.barangay.id,
      periodId: fixture.periods.jan2024.id,
      entryDate: "2024-01-02",
      book: "CRJ",
      particulars: "Opening deposit",
      lines: [
        { accountId: fixture.accounts.cashInBank.id, side: "debit", amountCentavos: toCentavos(1000) },
        { accountId: fixture.accounts.ira.id, side: "credit", amountCentavos: toCentavos(1000) },
      ],
    });
    const withItem = await addReconcilingItemAction(fixture.db, {
      context,
      reconciliationId: started.reconciliation.id,
      side: "book",
      itemType: "debit_memo",
      amountCentavos: -toCentavos(150),
      explanation: "Bank service charge",
    });
    const item = withItem.items[0];

    const { worksheet } = await postAdjustingEntryAction(fixture.db, {
      context,
      reconcilingItemId: item.id,
      itemAmountCentavos: item.amountCentavos,
      entryDate: "2024-01-31",
      particulars: "Bank reconciliation adjustment — service charge",
      offsetAccountId: fixture.accounts.electricity.id,
    });

    expect(worksheet.liveBookBalanceCentavos).toBe(toCentavos(1000) - toCentavos(150));
  });
});

describe("finalizeReconciliationAction", () => {
  it("finalises cleanly when the variance is zero", async () => {
    const fixture = await seedForWrites();
    const context = await seedBankAccountAndContext(fixture);
    const started = await startReconciliationAction(fixture.db, {
      context,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(0),
    });

    const final = await finalizeReconciliationAction(fixture.db, {
      context,
      reconciliationId: started.reconciliation.id,
    });
    expect(final.reconciliation.status).toBe("final");
  });

  it("refuses without an override reason when the variance is nonzero", async () => {
    const fixture = await seedForWrites();
    const context = await seedBankAccountAndContext(fixture);
    const started = await startReconciliationAction(fixture.db, {
      context,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(500),
    });

    await expect(
      finalizeReconciliationAction(fixture.db, { context, reconciliationId: started.reconciliation.id }),
    ).rejects.toThrow();
  });

  it("finalises with a written override reason", async () => {
    const fixture = await seedForWrites();
    const context = await seedBankAccountAndContext(fixture);
    const started = await startReconciliationAction(fixture.db, {
      context,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(500),
    });

    const final = await finalizeReconciliationAction(fixture.db, {
      context,
      reconciliationId: started.reconciliation.id,
      varianceOverrideReason: "Approved pending the bank's own correction next month.",
    });
    expect(final.reconciliation.status).toBe("final");
    expect(final.reconciliation.varianceOverrideReason).toContain("Approved");
  });
});
