import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "./fixtures";
import {
  addReconcilingItem,
  createBankAccount,
  finalizeReconciliation,
  linkAdjustingEntry,
  markCheckCleared,
  startReconciliation,
  updateReconciliationHeader,
} from "../bankReconciliation";
import { createDraftEntry, postEntry } from "../post";
import { InvalidStatusError } from "../errors";
import { auditLog } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { toCentavos } from "../../money";

async function seedBankAccount(fixture: Awaited<ReturnType<typeof seedEngineFixture>>) {
  return createBankAccount(fixture.db, {
    barangayId: fixture.barangay.id,
    bankName: "Land Bank of the Philippines",
    accountNo: "1234-5678-90",
    accountName: "General Fund",
    glAccountId: fixture.accounts.cashInBank.id,
    recordedBy: fixture.admin.id,
  });
}

describe("createBankAccount", () => {
  it("adds a bank account and audit-logs the write", async () => {
    const fixture = await seedEngineFixture();
    const account = await seedBankAccount(fixture);

    expect(account.id).toBeGreaterThan(0);
    expect(account.bankName).toBe("Land Bank of the Philippines");
    expect(account.isActive).toBe(true);

    const audit = await fixture.db.query.select().from(auditLog).where(eq(auditLog.tableName, "bank_account")).all();
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("bank_account.create");
  });

  it("refuses a blank bank name, account number, or account name", async () => {
    const fixture = await seedEngineFixture();
    const base = {
      barangayId: fixture.barangay.id,
      glAccountId: fixture.accounts.cashInBank.id,
      recordedBy: fixture.admin.id,
    };
    await expect(
      createBankAccount(fixture.db, { ...base, bankName: "  ", accountNo: "123", accountName: "GF" }),
    ).rejects.toThrow(InvalidStatusError);
    await expect(
      createBankAccount(fixture.db, { ...base, bankName: "LBP", accountNo: "", accountName: "GF" }),
    ).rejects.toThrow(InvalidStatusError);
    await expect(
      createBankAccount(fixture.db, { ...base, bankName: "LBP", accountNo: "123", accountName: "" }),
    ).rejects.toThrow(InvalidStatusError);
  });
});

describe("startReconciliation", () => {
  it("starts a draft reconciliation and audit-logs it", async () => {
    const fixture = await seedEngineFixture();
    const bankAcct = await seedBankAccount(fixture);

    const recon = await startReconciliation(fixture.db, {
      bankAccountId: bankAcct.id,
      periodId: fixture.periods.jan2024.id,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(50000),
      bookBalanceCentavos: toCentavos(50000),
      preparedBy: fixture.admin.id,
    });

    expect(recon.status).toBe("draft");
    expect(recon.statementBalanceCentavos).toBe(toCentavos(50000));

    const audit = await fixture.db.query
      .select()
      .from(auditLog)
      .where(eq(auditLog.tableName, "bank_reconciliation"))
      .all();
    expect(audit.some((row) => row.action === "bank_reconciliation.start")).toBe(true);
  });

  it("refuses a second reconciliation for the same account and period", async () => {
    const fixture = await seedEngineFixture();
    const bankAcct = await seedBankAccount(fixture);
    const input = {
      bankAccountId: bankAcct.id,
      periodId: fixture.periods.jan2024.id,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(50000),
      bookBalanceCentavos: toCentavos(50000),
      preparedBy: fixture.admin.id,
    };
    await startReconciliation(fixture.db, input);
    await expect(startReconciliation(fixture.db, input)).rejects.toThrow(InvalidStatusError);
  });

  it("allows the same bank account to have separate reconciliations in different periods", async () => {
    const fixture = await seedEngineFixture();
    const bankAcct = await seedBankAccount(fixture);
    await startReconciliation(fixture.db, {
      bankAccountId: bankAcct.id,
      periodId: fixture.periods.jan2024.id,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(50000),
      bookBalanceCentavos: toCentavos(50000),
      preparedBy: fixture.admin.id,
    });
    const feb = await startReconciliation(fixture.db, {
      bankAccountId: bankAcct.id,
      periodId: fixture.periods.feb2024.id,
      statementDate: "2024-02-29",
      statementBalanceCentavos: toCentavos(60000),
      bookBalanceCentavos: toCentavos(60000),
      preparedBy: fixture.admin.id,
    });
    expect(feb.id).toBeGreaterThan(0);
  });
});

describe("updateReconciliationHeader", () => {
  it("corrects the statement date and balance while still a draft", async () => {
    const fixture = await seedEngineFixture();
    const bankAcct = await seedBankAccount(fixture);
    const recon = await startReconciliation(fixture.db, {
      bankAccountId: bankAcct.id,
      periodId: fixture.periods.jan2024.id,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(50000),
      bookBalanceCentavos: toCentavos(50000),
      preparedBy: fixture.admin.id,
    });

    const updated = await updateReconciliationHeader(fixture.db, {
      reconciliationId: recon.id,
      statementDate: "2024-01-30",
      statementBalanceCentavos: toCentavos(51000),
      updatedBy: fixture.admin.id,
    });
    expect(updated.statementDate).toBe("2024-01-30");
    expect(updated.statementBalanceCentavos).toBe(toCentavos(51000));
  });

  it("refuses to edit a finalised reconciliation", async () => {
    const fixture = await seedEngineFixture();
    const bankAcct = await seedBankAccount(fixture);
    const recon = await startReconciliation(fixture.db, {
      bankAccountId: bankAcct.id,
      periodId: fixture.periods.jan2024.id,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(50000),
      bookBalanceCentavos: toCentavos(50000),
      preparedBy: fixture.admin.id,
    });
    await finalizeReconciliation(fixture.db, {
      reconciliationId: recon.id,
      currentBookBalanceCentavos: toCentavos(50000),
      varianceCentavos: 0,
      finalizedBy: fixture.admin.id,
    });

    await expect(
      updateReconciliationHeader(fixture.db, {
        reconciliationId: recon.id,
        statementDate: "2024-01-30",
        statementBalanceCentavos: toCentavos(51000),
        updatedBy: fixture.admin.id,
      }),
    ).rejects.toThrow(InvalidStatusError);
  });
});

describe("addReconcilingItem", () => {
  async function seedDraftRecon(fixture: Awaited<ReturnType<typeof seedEngineFixture>>) {
    const bankAcct = await seedBankAccount(fixture);
    return startReconciliation(fixture.db, {
      bankAccountId: bankAcct.id,
      periodId: fixture.periods.jan2024.id,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(50000),
      bookBalanceCentavos: toCentavos(49500),
      preparedBy: fixture.admin.id,
    });
  }

  it("adds a bank-side item and audit-logs it", async () => {
    const fixture = await seedEngineFixture();
    const recon = await seedDraftRecon(fixture);

    const item = await addReconcilingItem(fixture.db, {
      reconciliationId: recon.id,
      side: "bank",
      itemType: "checks_issued_not_taken_up",
      amountCentavos: -toCentavos(500),
      explanation: "Check #1001, issued 2024-01-28",
      recordedBy: fixture.admin.id,
    });
    expect(item.amountCentavos).toBe(-toCentavos(500));
    expect(item.adjustingEntryId).toBeNull();

    const audit = await fixture.db.query
      .select()
      .from(auditLog)
      .where(eq(auditLog.tableName, "reconciling_item"))
      .all();
    expect(audit.some((row) => row.action === "reconciling_item.create")).toBe(true);
  });

  it("refuses a zero-amount item", async () => {
    const fixture = await seedEngineFixture();
    const recon = await seedDraftRecon(fixture);
    await expect(
      addReconcilingItem(fixture.db, {
        reconciliationId: recon.id,
        side: "book",
        itemType: "debit_memo",
        amountCentavos: 0,
        recordedBy: fixture.admin.id,
      }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses to add an item to a finalised reconciliation", async () => {
    const fixture = await seedEngineFixture();
    const recon = await seedDraftRecon(fixture);
    await finalizeReconciliation(fixture.db, {
      reconciliationId: recon.id,
      currentBookBalanceCentavos: toCentavos(49500),
      varianceCentavos: 0,
      varianceOverrideReason: "n/a",
      finalizedBy: fixture.admin.id,
    });

    await expect(
      addReconcilingItem(fixture.db, {
        reconciliationId: recon.id,
        side: "book",
        itemType: "debit_memo",
        amountCentavos: -toCentavos(500),
        recordedBy: fixture.admin.id,
      }),
    ).rejects.toThrow(InvalidStatusError);
  });
});

describe("linkAdjustingEntry", () => {
  async function seedBookSideItem(fixture: Awaited<ReturnType<typeof seedEngineFixture>>) {
    const bankAcct = await seedBankAccount(fixture);
    const recon = await startReconciliation(fixture.db, {
      bankAccountId: bankAcct.id,
      periodId: fixture.periods.jan2024.id,
      statementDate: "2024-01-31",
      statementBalanceCentavos: toCentavos(50000),
      bookBalanceCentavos: toCentavos(50000),
      preparedBy: fixture.admin.id,
    });
    const item = await addReconcilingItem(fixture.db, {
      reconciliationId: recon.id,
      side: "book",
      itemType: "debit_memo",
      amountCentavos: -toCentavos(150),
      explanation: "Bank service charge",
      recordedBy: fixture.admin.id,
    });
    return { bankAcct, recon, item };
  }

  it("links a posted voucher to a book-side item", async () => {
    const fixture = await seedEngineFixture();
    const { item } = await seedBookSideItem(fixture);

    const draft = await createDraftEntry(fixture.db, {
      barangayId: fixture.barangay.id,
      periodId: fixture.periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Bank service charge adjustment",
      createdBy: fixture.admin.id,
      lines: [
        { accountId: fixture.accounts.electricity.id, side: "debit", amountCentavos: toCentavos(150) },
        { accountId: fixture.accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(150) },
      ],
    });
    const posted = await postEntry(fixture.db, { entryId: draft.id, postedBy: fixture.admin.id });

    const linked = await linkAdjustingEntry(fixture.db, {
      reconcilingItemId: item.id,
      entryId: posted.id,
      linkedBy: fixture.admin.id,
    });
    expect(linked.adjustingEntryId).toBe(posted.id);
  });

  it("refuses to link a bank-side item — must never be journalised (D5)", async () => {
    const fixture = await seedEngineFixture();
    const recon = await seedDraftReconFor(fixture);
    const item = await addReconcilingItem(fixture.db, {
      reconciliationId: recon.id,
      side: "bank",
      itemType: "checks_issued_not_taken_up",
      amountCentavos: -toCentavos(500),
      recordedBy: fixture.admin.id,
    });

    await expect(
      linkAdjustingEntry(fixture.db, { reconcilingItemId: item.id, entryId: 1, linkedBy: fixture.admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses to link a second adjusting entry to the same item", async () => {
    const fixture = await seedEngineFixture();
    const { item } = await seedBookSideItem(fixture);

    async function postAdjustment(particulars: string) {
      const draft = await createDraftEntry(fixture.db, {
        barangayId: fixture.barangay.id,
        periodId: fixture.periods.jan2024.id,
        entryDate: "2024-01-31",
        book: "GJ",
        particulars,
        createdBy: fixture.admin.id,
        lines: [
          { accountId: fixture.accounts.electricity.id, side: "debit", amountCentavos: toCentavos(150) },
          { accountId: fixture.accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(150) },
        ],
      });
      return postEntry(fixture.db, { entryId: draft.id, postedBy: fixture.admin.id });
    }

    const first = await postAdjustment("First adjustment");
    await linkAdjustingEntry(fixture.db, { reconcilingItemId: item.id, entryId: first.id, linkedBy: fixture.admin.id });

    const second = await postAdjustment("Second adjustment");
    await expect(
      linkAdjustingEntry(fixture.db, { reconcilingItemId: item.id, entryId: second.id, linkedBy: fixture.admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });
});

async function seedDraftReconFor(fixture: Awaited<ReturnType<typeof seedEngineFixture>>) {
  const bankAcct = await createBankAccount(fixture.db, {
    barangayId: fixture.barangay.id,
    bankName: "Land Bank of the Philippines",
    accountNo: "1234-5678-90",
    accountName: "General Fund",
    glAccountId: fixture.accounts.cashInBank.id,
    recordedBy: fixture.admin.id,
  });
  return startReconciliation(fixture.db, {
    bankAccountId: bankAcct.id,
    periodId: fixture.periods.jan2024.id,
    statementDate: "2024-01-31",
    statementBalanceCentavos: toCentavos(50000),
    bookBalanceCentavos: toCentavos(50000),
    preparedBy: fixture.admin.id,
  });
}

describe("finalizeReconciliation", () => {
  it("finalises cleanly when the variance is zero", async () => {
    const fixture = await seedEngineFixture();
    const recon = await seedDraftReconFor(fixture);

    const final = await finalizeReconciliation(fixture.db, {
      reconciliationId: recon.id,
      currentBookBalanceCentavos: toCentavos(50000),
      varianceCentavos: 0,
      finalizedBy: fixture.admin.id,
    });
    expect(final.status).toBe("final");
    expect(final.bookBalanceCentavos).toBe(toCentavos(50000));
    expect(final.varianceOverrideReason).toBeNull();
  });

  it("refuses to finalise a nonzero variance without a written override reason (D7)", async () => {
    const fixture = await seedEngineFixture();
    const recon = await seedDraftReconFor(fixture);

    await expect(
      finalizeReconciliation(fixture.db, {
        reconciliationId: recon.id,
        currentBookBalanceCentavos: toCentavos(49000),
        varianceCentavos: toCentavos(1000),
        finalizedBy: fixture.admin.id,
      }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("finalises a nonzero variance with a written override reason", async () => {
    const fixture = await seedEngineFixture();
    const recon = await seedDraftReconFor(fixture);

    const final = await finalizeReconciliation(fixture.db, {
      reconciliationId: recon.id,
      currentBookBalanceCentavos: toCentavos(49000),
      varianceCentavos: toCentavos(1000),
      varianceOverrideReason: "Discrepancy under investigation with the bank; approved to close the month.",
      finalizedBy: fixture.admin.id,
    });
    expect(final.status).toBe("final");
    expect(final.varianceOverrideReason).toContain("Discrepancy");
  });

  it("refuses to finalise an already-final reconciliation", async () => {
    const fixture = await seedEngineFixture();
    const recon = await seedDraftReconFor(fixture);
    await finalizeReconciliation(fixture.db, {
      reconciliationId: recon.id,
      currentBookBalanceCentavos: toCentavos(50000),
      varianceCentavos: 0,
      finalizedBy: fixture.admin.id,
    });

    await expect(
      finalizeReconciliation(fixture.db, {
        reconciliationId: recon.id,
        currentBookBalanceCentavos: toCentavos(50000),
        varianceCentavos: 0,
        finalizedBy: fixture.admin.id,
      }),
    ).rejects.toThrow(InvalidStatusError);
  });
});

describe("markCheckCleared", () => {
  async function seedPostedCheck(fixture: Awaited<ReturnType<typeof seedEngineFixture>>) {
    const draft = await createDraftEntry(fixture.db, {
      barangayId: fixture.barangay.id,
      periodId: fixture.periods.jan2024.id,
      entryDate: "2024-01-10",
      book: "CkDJ",
      particulars: "Payment of office supplies",
      checkNo: "0001234",
      checkDate: "2024-01-10",
      createdBy: fixture.admin.id,
      lines: [
        { accountId: fixture.accounts.electricity.id, side: "debit", amountCentavos: toCentavos(1000) },
        { accountId: fixture.accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(1000) },
      ],
    });
    return postEntry(fixture.db, { entryId: draft.id, postedBy: fixture.admin.id });
  }

  it("marks a check cleared and audit-logs it", async () => {
    const fixture = await seedEngineFixture();
    const check = await seedPostedCheck(fixture);

    const cleared = await markCheckCleared(fixture.db, {
      entryId: check.id,
      clearedDate: "2024-01-20",
      clearedBy: fixture.admin.id,
    });
    expect(cleared.clearedDate).toBe("2024-01-20");

    const audit = await fixture.db.query.select().from(auditLog).where(eq(auditLog.tableName, "journal_entry")).all();
    expect(audit.some((row) => row.action === "journal_entry.mark_cleared")).toBe(true);
  });

  it("refuses a check that is not a posted CkDJ", async () => {
    const fixture = await seedEngineFixture();
    const draft = await createDraftEntry(fixture.db, {
      barangayId: fixture.barangay.id,
      periodId: fixture.periods.jan2024.id,
      entryDate: "2024-01-10",
      book: "GJ",
      particulars: "Not a check",
      createdBy: fixture.admin.id,
      lines: [
        { accountId: fixture.accounts.electricity.id, side: "debit", amountCentavos: toCentavos(1000) },
        { accountId: fixture.accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(1000) },
      ],
    });
    const posted = await postEntry(fixture.db, { entryId: draft.id, postedBy: fixture.admin.id });

    await expect(
      markCheckCleared(fixture.db, { entryId: posted.id, clearedDate: "2024-01-20", clearedBy: fixture.admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses to clear a check already marked cleared", async () => {
    const fixture = await seedEngineFixture();
    const check = await seedPostedCheck(fixture);
    await markCheckCleared(fixture.db, { entryId: check.id, clearedDate: "2024-01-20", clearedBy: fixture.admin.id });

    await expect(
      markCheckCleared(fixture.db, { entryId: check.id, clearedDate: "2024-01-25", clearedBy: fixture.admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses a cleared date earlier than the check date", async () => {
    const fixture = await seedEngineFixture();
    const check = await seedPostedCheck(fixture);

    await expect(
      markCheckCleared(fixture.db, { entryId: check.id, clearedDate: "2024-01-01", clearedBy: fixture.admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });
});
