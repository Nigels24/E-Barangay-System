import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "./fixtures";
import { createDraftEntry, postEntry } from "../post";
import { closePeriod, ensurePeriod } from "../period";
import { voidEntry } from "../void";
import { InvalidStatusError, ClosedPeriodError } from "../errors";
import { journalEntry, journalEntryLine, auditLog, barangay } from "../../../db/schema";
import { eq } from "drizzle-orm";

function postSimpleEntry(fixture: ReturnType<typeof seedEngineFixture>, amountCentavos = 1000) {
  const { db, barangay, user, accounts, periods } = fixture;
  const draft = createDraftEntry(db, {
    barangayId: barangay.id,
    periodId: periods.jan2024.id,
    entryDate: "2024-01-31",
    book: "GJ",
    particulars: "Payment of electric bill",
    createdBy: user.id,
    lines: [
      { accountId: accounts.electricity.id, side: "debit", amountCentavos },
      { accountId: accounts.cashInBank.id, side: "credit", amountCentavos },
    ],
  });
  return postEntry(db, { entryId: draft.id, postedBy: user.id });
}

describe("voidEntry", () => {
  it("marks the original entry voided and posts a balanced reversal", () => {
    const fixture = seedEngineFixture();
    const { db, admin, periods } = fixture;
    const posted = postSimpleEntry(fixture);

    const result = voidEntry(db, {
      entryId: posted.id,
      reason: "Wrong account used",
      voidedBy: admin.id,
      reversalDate: "2024-01-31",
      reversalPeriodId: periods.jan2024.id,
    });

    expect(result.voided.status).toBe("voided");
    expect(result.voided.voidReason).toBe("Wrong account used");
    expect(result.reversal.status).toBe("posted");
    expect(result.reversal.reversesEntryId).toBe(posted.id);
  });

  it("the reversal's lines are the exact original lines with debit and credit swapped", () => {
    const fixture = seedEngineFixture();
    const { db, admin, periods } = fixture;
    const posted = postSimpleEntry(fixture, 1593128);

    const originalLines = db.select().from(journalEntryLine).where(eq(journalEntryLine.entryId, posted.id)).all();
    const result = voidEntry(db, {
      entryId: posted.id,
      reason: "Duplicate entry",
      voidedBy: admin.id,
      reversalDate: "2024-01-31",
      reversalPeriodId: periods.jan2024.id,
    });
    const reversalLines = db
      .select()
      .from(journalEntryLine)
      .where(eq(journalEntryLine.entryId, result.reversal.id))
      .all();

    expect(reversalLines).toHaveLength(originalLines.length);
    for (let i = 0; i < originalLines.length; i++) {
      expect(reversalLines[i].debitCentavos).toBe(originalLines[i].creditCentavos);
      expect(reversalLines[i].creditCentavos).toBe(originalLines[i].debitCentavos);
      expect(reversalLines[i].accountId).toBe(originalLines[i].accountId);
    }
  });

  it("the reversal always books to the General Journal, even reversing a Check Disbursement", () => {
    const fixture = seedEngineFixture();
    const { db, barangay, user, admin, accounts, periods } = fixture;
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.feb2024.id,
      entryDate: "2024-02-01",
      book: "CkDJ",
      particulars: "Advance for Payroll",
      createdBy: user.id,
      checkNo: "3869301",
      checkDate: "2024-02-01",
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: 96305 },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 96305 },
      ],
    });
    const posted = postEntry(db, { entryId: draft.id, postedBy: user.id });

    const result = voidEntry(db, {
      entryId: posted.id,
      reason: "Check was voided by the bank",
      voidedBy: admin.id,
      reversalDate: "2024-02-02",
      reversalPeriodId: periods.feb2024.id,
    });
    expect(result.reversal.book).toBe("GJ");
  });

  it("net ledger effect of a voided entry is zero", () => {
    const fixture = seedEngineFixture();
    const { db, admin, periods, accounts } = fixture;
    const posted = postSimpleEntry(fixture, 50000);
    const result = voidEntry(db, {
      entryId: posted.id,
      reason: "Correction",
      voidedBy: admin.id,
      reversalDate: "2024-01-31",
      reversalPeriodId: periods.jan2024.id,
    });

    const allLines = db
      .select()
      .from(journalEntryLine)
      .where(eq(journalEntryLine.accountId, accounts.cashInBank.id))
      .all();
    const relevant = allLines.filter((l) => [posted.id, result.reversal.id].includes(l.entryId));
    const net = relevant.reduce((sum, l) => sum + l.debitCentavos - l.creditCentavos, 0);
    expect(net).toBe(0);
  });

  it("requires a reason", () => {
    const fixture = seedEngineFixture();
    const { db, admin, periods } = fixture;
    const posted = postSimpleEntry(fixture);
    expect(() =>
      voidEntry(db, { entryId: posted.id, reason: "", voidedBy: admin.id, reversalDate: "2024-01-31", reversalPeriodId: periods.jan2024.id }),
    ).toThrow(InvalidStatusError);
  });

  it("refuses to void a draft entry", () => {
    const fixture = seedEngineFixture();
    const { db, barangay, user, admin, accounts, periods } = fixture;
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Never posted",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: 1000 },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 1000 },
      ],
    });
    expect(() =>
      voidEntry(db, { entryId: draft.id, reason: "x", voidedBy: admin.id, reversalDate: "2024-01-31", reversalPeriodId: periods.jan2024.id }),
    ).toThrow(InvalidStatusError);
  });

  it("refuses to void the same entry twice", () => {
    const fixture = seedEngineFixture();
    const { db, admin, periods } = fixture;
    const posted = postSimpleEntry(fixture);
    voidEntry(db, { entryId: posted.id, reason: "First void", voidedBy: admin.id, reversalDate: "2024-01-31", reversalPeriodId: periods.jan2024.id });
    expect(() =>
      voidEntry(db, { entryId: posted.id, reason: "Second void", voidedBy: admin.id, reversalDate: "2024-01-31", reversalPeriodId: periods.jan2024.id }),
    ).toThrow(InvalidStatusError);
  });

  it("refuses to post a reversal into a closed period", () => {
    const fixture = seedEngineFixture();
    const { db, admin, periods } = fixture;
    const posted = postSimpleEntry(fixture);
    closePeriod(db, periods.jan2024.id, admin.id);
    expect(() =>
      voidEntry(db, { entryId: posted.id, reason: "x", voidedBy: admin.id, reversalDate: "2024-01-31", reversalPeriodId: periods.jan2024.id }),
    ).toThrow(ClosedPeriodError);
  });

  it("refuses a reversal period belonging to a different barangay", () => {
    const fixture = seedEngineFixture();
    const { db, admin } = fixture;
    const posted = postSimpleEntry(fixture);
    const otherBarangay = db
      .insert(barangay)
      .values({ code: "TEST-OTHER", name: "Barangay Test Other" })
      .returning()
      .get();
    const otherPeriod = ensurePeriod(db, otherBarangay.id, 2024, 1);
    expect(() =>
      voidEntry(db, { entryId: posted.id, reason: "x", voidedBy: admin.id, reversalDate: "2024-01-31", reversalPeriodId: otherPeriod.id }),
    ).toThrow(InvalidStatusError);
  });

  it("leaves the original posted entry's own row untouched except for its void fields", () => {
    const fixture = seedEngineFixture();
    const { db, admin, periods } = fixture;
    const posted = postSimpleEntry(fixture);
    voidEntry(db, { entryId: posted.id, reason: "x", voidedBy: admin.id, reversalDate: "2024-01-31", reversalPeriodId: periods.jan2024.id });
    const row = db.select().from(journalEntry).where(eq(journalEntry.id, posted.id)).get();
    expect(row?.jevNo).toBe(posted.jevNo);
    expect(row?.particulars).toBe(posted.particulars);
  });

  it("writes both a void and a post audit entry", () => {
    const fixture = seedEngineFixture();
    const { db, admin, periods } = fixture;
    const posted = postSimpleEntry(fixture);
    voidEntry(db, { entryId: posted.id, reason: "x", voidedBy: admin.id, reversalDate: "2024-01-31", reversalPeriodId: periods.jan2024.id });
    const logs = db.select().from(auditLog).where(eq(auditLog.userId, admin.id)).all();
    expect(logs.map((l) => l.action)).toEqual(expect.arrayContaining(["journal_entry.void", "journal_entry.post"]));
  });
});
