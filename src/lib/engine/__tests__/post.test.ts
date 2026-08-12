import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "./fixtures";
import { createDraftEntry, postEntry } from "../post";
import { closePeriod } from "../period";
import { toCentavos } from "../../money";
import { journalEntry, journalEntryLine, account } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { UnbalancedEntryError, ClosedPeriodError, InvalidStatusError, MissingCheckDetailsError } from "../errors";

describe("createDraftEntry", () => {
  it("creates a draft with lines, untouched by the ledger", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Payment of electric bill",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: toCentavos(15931.28) },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(15931.28) },
      ],
    });
    expect(draft.status).toBe("draft");
    expect(draft.jevNo).toBeNull();

    const lines = db.select().from(journalEntryLine).where(eq(journalEntryLine.entryId, draft.id)).all();
    expect(lines).toHaveLength(2);
  });

  it("refuses a voucher with fewer than two lines", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    expect(() =>
      createDraftEntry(db, {
        barangayId: barangay.id,
        periodId: periods.jan2024.id,
        entryDate: "2024-01-31",
        book: "GJ",
        particulars: "Bad voucher",
        createdBy: user.id,
        lines: [{ accountId: accounts.cashInBank.id, side: "debit", amountCentavos: 100 }],
      }),
    ).toThrow(UnbalancedEntryError);
  });

  it("refuses a line with a zero amount at the database level", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    expect(() =>
      createDraftEntry(db, {
        barangayId: barangay.id,
        periodId: periods.jan2024.id,
        entryDate: "2024-01-31",
        book: "GJ",
        particulars: "Bad voucher",
        createdBy: user.id,
        lines: [
          { accountId: accounts.cashInBank.id, side: "debit", amountCentavos: 0 },
          { accountId: accounts.equity.id, side: "credit", amountCentavos: 0 },
        ],
      }),
    ).toThrow();
  });
});

describe("postEntry", () => {
  it("posts a balanced two-line voucher and assigns a voucher number", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Payment of electric bill",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: toCentavos(15931.28) },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(15931.28) },
      ],
    });

    const posted = postEntry(db, { entryId: draft.id, postedBy: user.id });
    expect(posted.status).toBe("posted");
    expect(posted.jevNo).toBe("2024-01-001");
    expect(posted.postedBy).toBe(user.id);
  });

  it("posts a real multi-line collection voucher from the client's Jan 2023 books", () => {
    // Dr Cash in Local Treasury 6,860 + Dr Cash in Bank 210,158
    // Cr Share from IRA 210,158 + Cr Clearance Fees 4,220 + Cr Other Business Income 2,640
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    const cashInLocalTreasury = db
      .insert(account)
      .values({ code: "1-01-01-010", name: "Cash in Local Treasury", accountType: "asset", normalBalance: "debit" })
      .returning()
      .get();
    const clearanceFees = db
      .insert(account)
      .values({ code: "4-04-01-010", name: "Clearance and Certificate Fees", accountType: "income", normalBalance: "credit" })
      .returning()
      .get();
    const otherBusinessIncome = db
      .insert(account)
      .values({ code: "4-04-02-990", name: "Other Business Income", accountType: "income", normalBalance: "credit" })
      .returning()
      .get();

    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "CRJ",
      particulars: "Collection & IRA received in Jan",
      createdBy: user.id,
      lines: [
        { accountId: cashInLocalTreasury.id, side: "debit", amountCentavos: toCentavos(6860) },
        { accountId: accounts.cashInBank.id, side: "debit", amountCentavos: toCentavos(210158) },
        { accountId: accounts.ira.id, side: "credit", amountCentavos: toCentavos(210158) },
        { accountId: clearanceFees.id, side: "credit", amountCentavos: toCentavos(4220) },
        { accountId: otherBusinessIncome.id, side: "credit", amountCentavos: toCentavos(2640) },
      ],
    });

    const posted = postEntry(db, { entryId: draft.id, postedBy: user.id });
    expect(posted.status).toBe("posted");
    expect(posted.book).toBe("CRJ");
  });

  it("assigns sequential numbers scoped per barangay + book + month", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    const post = () => {
      const d = createDraftEntry(db, {
        barangayId: barangay.id,
        periodId: periods.jan2024.id,
        entryDate: "2024-01-15",
        book: "GJ",
        particulars: "Adjustment",
        createdBy: user.id,
        lines: [
          { accountId: accounts.electricity.id, side: "debit", amountCentavos: 1000 },
          { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 1000 },
        ],
      });
      return postEntry(db, { entryId: d.id, postedBy: user.id });
    };
    expect(post().jevNo).toBe("2024-01-001");
    expect(post().jevNo).toBe("2024-01-002");
    expect(post().jevNo).toBe("2024-01-003");
  });

  it("a different book restarts its own sequence in the same month", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    const gj = postEntry(db, {
      entryId: createDraftEntry(db, {
        barangayId: barangay.id,
        periodId: periods.jan2024.id,
        entryDate: "2024-01-15",
        book: "GJ",
        particulars: "Adjustment",
        createdBy: user.id,
        lines: [
          { accountId: accounts.electricity.id, side: "debit", amountCentavos: 1000 },
          { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 1000 },
        ],
      }).id,
      postedBy: user.id,
    });
    const crj = postEntry(db, {
      entryId: createDraftEntry(db, {
        barangayId: barangay.id,
        periodId: periods.jan2024.id,
        entryDate: "2024-01-15",
        book: "CRJ",
        particulars: "Collection",
        createdBy: user.id,
        lines: [
          { accountId: accounts.cashInBank.id, side: "debit", amountCentavos: 1000 },
          { accountId: accounts.ira.id, side: "credit", amountCentavos: 1000 },
        ],
      }).id,
      postedBy: user.id,
    });
    expect(gj.jevNo).toBe("2024-01-001");
    expect(crj.jevNo).toBe("2024-01-001");
  });

  it("a manually back-entered number pushes the next auto-generated number past it", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    // Simulate a historical voucher entered with its original paper number (D15).
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-05",
      book: "GJ",
      particulars: "Back-entered historical voucher",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: 1000 },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 1000 },
      ],
    });
    const posted = postEntry(db, { entryId: draft.id, postedBy: user.id });
    expect(posted.jevNo).toBe("2024-01-001");

    // Now force a high manual number directly (as a data-migration script would), then post another.
    db.update(journalEntry).set({ jevNo: "2024-01-050" }).where(eq(journalEntry.id, posted.id)).run();

    const next = postEntry(db, {
      entryId: createDraftEntry(db, {
        barangayId: barangay.id,
        periodId: periods.jan2024.id,
        entryDate: "2024-01-06",
        book: "GJ",
        particulars: "Next one",
        createdBy: user.id,
        lines: [
          { accountId: accounts.electricity.id, side: "debit", amountCentavos: 1000 },
          { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 1000 },
        ],
      }).id,
      postedBy: user.id,
    });
    expect(next.jevNo).toBe("2024-01-051");
  });

  it("refuses to post an unbalanced voucher", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    // Insert lines directly to bypass createDraftEntry's own checks and exercise postEntry's gate.
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Unbalanced",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: 1000 },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 999 },
      ],
    });
    expect(() => postEntry(db, { entryId: draft.id, postedBy: user.id })).toThrow(UnbalancedEntryError);
  });

  it("refuses to post into a closed period", () => {
    const { db, barangay, user, admin, accounts, periods } = seedEngineFixture();
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Late entry",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: 1000 },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 1000 },
      ],
    });
    closePeriod(db, periods.jan2024.id, admin.id);
    expect(() => postEntry(db, { entryId: draft.id, postedBy: user.id })).toThrow(ClosedPeriodError);
  });

  it("refuses to post an entry twice", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Once only",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: 1000 },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 1000 },
      ],
    });
    postEntry(db, { entryId: draft.id, postedBy: user.id });
    expect(() => postEntry(db, { entryId: draft.id, postedBy: user.id })).toThrow(InvalidStatusError);
  });

  it("refuses to post a nonexistent entry", () => {
    const { db, user } = seedEngineFixture();
    expect(() => postEntry(db, { entryId: 999999, postedBy: user.id })).toThrow(InvalidStatusError);
  });

  it("refuses to post a Check Disbursement voucher without check number and date", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.feb2024.id,
      entryDate: "2024-02-01",
      book: "CkDJ",
      particulars: "Advance for Payroll",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: toCentavos(96305) },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(96305) },
      ],
    });
    expect(() => postEntry(db, { entryId: draft.id, postedBy: user.id })).toThrow(MissingCheckDetailsError);
  });

  it("posts a Check Disbursement voucher once check number and date are present", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.feb2024.id,
      entryDate: "2024-02-01",
      book: "CkDJ",
      particulars: "Advance for Payroll — CK# 3869301",
      createdBy: user.id,
      checkNo: "3869301",
      checkDate: "2024-02-01",
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: toCentavos(96305) },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(96305) },
      ],
    });
    const posted = postEntry(db, { entryId: draft.id, postedBy: user.id });
    expect(posted.status).toBe("posted");
    expect(posted.checkNo).toBe("3869301");
  });
});
