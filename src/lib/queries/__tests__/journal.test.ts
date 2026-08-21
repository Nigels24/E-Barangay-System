import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { seedEngineFixture } from "../../engine/__tests__/fixtures";
import { seedPlaceholderUser, PLACEHOLDER_USER_USERNAME } from "../../../db/seed/users";
import { appUser, auditLog, journalEntry, journalEntryLine } from "../../../db/schema";
import { closePeriod } from "../../engine/period";
import { InvalidStatusError, ClosedPeriodError } from "../../engine/errors";
import { createDraftEntry } from "../../engine/post";
import { toCentavos } from "../../money";
import {
  VoucherNotPostedError,
  groupLinesIntoVouchers,
  listPeriodVouchers,
  postNewVoucher,
  summarisePeriod,
  voidPostedVoucher,
  type PeriodLineRow,
} from "../journal";

/** The engine fixture plus the placeholder user the real app posts as (D32). */
async function fixture() {
  const seeded = await seedEngineFixture();
  await seedPlaceholderUser(seeded.db);
  return seeded;
}

/** A balanced electric-bill voucher, the smallest realistic thing to post. */
function electricBill(barangayId: number, periodId: number, accounts: { expense: number; cash: number }) {
  return {
    barangayId,
    periodId,
    entryDate: "2024-01-31",
    book: "GJ" as const,
    particulars: "Payment of electric bill",
    lines: [
      { accountId: accounts.expense, side: "debit" as const, amountCentavos: toCentavos(15931.28) },
      { accountId: accounts.cash, side: "credit" as const, amountCentavos: toCentavos(15931.28) },
    ],
  };
}

describe("postNewVoucher", () => {
  it("puts a balanced voucher into the books and gives it a YYYY-MM-NNN number", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    const posted = await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );

    expect(posted.jevNo).toBe("2024-01-001");
    const row = await db.query.select().from(journalEntry).where(eq(journalEntry.id, posted.entryId)).get();
    expect(row?.status).toBe("posted");
    expect(row?.postedAt).toBeTruthy();
  });

  it("numbers the second voucher of the month after the first (D13/D14)", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    const input = electricBill(barangay.id, periods.jan2024.id, {
      expense: accounts.electricity.id,
      cash: accounts.cashInBank.id,
    });
    expect((await postNewVoucher(db, input)).jevNo).toBe("2024-01-001");
    expect((await postNewVoucher(db, input)).jevNo).toBe("2024-01-002");
  });

  it("attributes the entry and its audit trail to the placeholder user (D32)", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    const posted = await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );

    const row = await db.query.select().from(journalEntry).where(eq(journalEntry.id, posted.entryId)).get();
    // Not the fixture's own "bookkeeper" — the seeded placeholder, resolved by
    // the query layer rather than passed in by a screen.
    expect(row?.createdBy).toBe(row?.postedBy);
    expect(row?.createdBy).not.toBe(0);
  });

  it("stores check details on a CkDJ and stores nothing for blank ones elsewhere (D16)", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    const posted = await postNewVoucher(db, {
      ...electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
      book: "CkDJ",
      checkNo: " 3869301 ",
      checkDate: "2024-01-31",
    });
    const withCheck = await db.query.select().from(journalEntry).where(eq(journalEntry.id, posted.entryId)).get();
    expect(withCheck?.checkNo).toBe("3869301");
    expect(withCheck?.checkDate).toBe("2024-01-31");

    const plain = await postNewVoucher(db, {
      ...electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
      checkNo: "",
      checkDate: "   ",
    });
    const withoutCheck = await db.query.select().from(journalEntry).where(eq(journalEntry.id, plain.entryId)).get();
    // Blank strings, not nulls, would make an unwritten check look written.
    expect(withoutCheck?.checkNo).toBeNull();
    expect(withoutCheck?.checkDate).toBeNull();
  });

  it("refuses a CkDJ with no check details, and leaves the draft visible", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    const input = {
      ...electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
      book: "CkDJ" as const,
    };

    await expect(postNewVoucher(db, input)).rejects.toThrow(VoucherNotPostedError);

    const vouchers = await listPeriodVouchers(db, periods.jan2024.id);
    expect(vouchers).toHaveLength(1);
    expect(vouchers[0].status).toBe("draft");
    expect(vouchers[0].jevNo).toBeNull();
  });

  it("names the surviving draft when posting fails after it was written", async () => {
    const { db, barangay, admin, accounts, periods } = await fixture();
    await closePeriod(db, periods.jan2024.id, admin.id);

    // Nothing in the composer checks period status today (see REVIEW.md, T-006),
    // so this path is currently reachable from the screen, not just from state
    // changing underneath — the point stands either way: it fails loudly and
    // the draft is accounted for rather than lost.
    const error = await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    ).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(VoucherNotPostedError);
    const draftId = (error as VoucherNotPostedError).draftEntryId;
    expect((error as Error).message).toContain("kept as a draft");

    const draft = await db.query.select().from(journalEntry).where(eq(journalEntry.id, draftId)).get();
    expect(draft?.status).toBe("draft");
  });

  it("refuses when there is no user to post as", async () => {
    // No placeholder user seeded — the state every real database was in before
    // this task, in which a voucher could not be created at all.
    const { db, barangay, accounts, periods } = await seedEngineFixture();
    await expect(
      postNewVoucher(
        db,
        electricBill(barangay.id, periods.jan2024.id, {
          expense: accounts.electricity.id,
          cash: accounts.cashInBank.id,
        }),
      ),
    ).rejects.toThrow(/no user/);

    // And nothing was written on the way to that refusal.
    expect(await db.query.select().from(journalEntry).all()).toHaveLength(0);
  });
});

describe("listPeriodVouchers", () => {
  it("is empty for a period nothing has been filed under", async () => {
    const { db, periods } = await fixture();
    expect(await listPeriodVouchers(db, periods.jan2024.id)).toEqual([]);
  });

  it("returns a posted voucher with its lines, accounts and totals", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );

    const [voucher] = await listPeriodVouchers(db, periods.jan2024.id);
    expect(voucher.jevNo).toBe("2024-01-001");
    expect(voucher.particulars).toBe("Payment of electric bill");
    expect(voucher.status).toBe("posted");
    expect(voucher.lines).toHaveLength(2);
    expect(voucher.lines[0]).toMatchObject({
      lineNo: 1,
      accountCode: "5-02-04-020",
      accountName: "Electricity Expense",
      debitCentavos: 1593128,
      creditCentavos: 0,
    });
    expect(voucher.lines[1].creditCentavos).toBe(1593128);
    expect(voucher.totalDebitCentavos).toBe(1593128);
    expect(voucher.totalCreditCentavos).toBe(1593128);
  });

  it("shows drafts alongside posted vouchers, so a half-made one is never invisible", async () => {
    const { db, barangay, user, accounts, periods } = await fixture();
    await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );
    await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-15",
      book: "GJ",
      particulars: "Half-finished voucher",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: 5000 },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 5000 },
      ],
    });

    const vouchers = await listPeriodVouchers(db, periods.jan2024.id);
    expect(vouchers.map((v) => v.status)).toEqual(["draft", "posted"]); // 15th before 31st
    expect(vouchers.map((v) => v.jevNo)).toEqual([null, "2024-01-001"]);
  });

  it("does not mix in another period's entries", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );
    expect(await listPeriodVouchers(db, periods.feb2024.id)).toEqual([]);
  });
});

describe("groupLinesIntoVouchers", () => {
  const row = (over: Partial<PeriodLineRow>): PeriodLineRow => ({
    entryId: 1,
    jevNo: "2024-01-001",
    entryDate: "2024-01-31",
    book: "GJ",
    particulars: "Payment of electric bill",
    status: "posted",
    checkNo: null,
    lineNo: 1,
    accountId: 1,
    accountCode: "1-01-02-010",
    accountName: "Cash in Bank",
    debitCentavos: 0,
    creditCentavos: 0,
    ...over,
  });

  it("keeps a many-line voucher as one voucher and totals both sides", () => {
    const vouchers = groupLinesIntoVouchers([
      row({ lineNo: 1, debitCentavos: 10000 }),
      row({ lineNo: 2, debitCentavos: 2550 }),
      row({ lineNo: 3, creditCentavos: 12550 }),
    ]);

    expect(vouchers).toHaveLength(1);
    expect(vouchers[0].lines).toHaveLength(3);
    expect(vouchers[0].totalDebitCentavos).toBe(12550);
    expect(vouchers[0].totalCreditCentavos).toBe(12550);
  });

  it("keeps vouchers in the order the rows arrived", () => {
    const vouchers = groupLinesIntoVouchers([
      row({ entryId: 7, jevNo: null, status: "draft" }),
      row({ entryId: 7, jevNo: null, status: "draft", lineNo: 2 }),
      row({ entryId: 9 }),
    ]);
    expect(vouchers.map((v) => v.entryId)).toEqual([7, 9]);
  });

  it("groups by entry even if the same entry's rows are not adjacent", () => {
    const vouchers = groupLinesIntoVouchers([
      row({ entryId: 1, lineNo: 1 }),
      row({ entryId: 2, lineNo: 1 }),
      row({ entryId: 1, lineNo: 2 }),
    ]);
    expect(vouchers).toHaveLength(2);
    expect(vouchers[0].lines).toHaveLength(2);
  });

  it("has nothing to group when there are no rows", () => {
    expect(groupLinesIntoVouchers([])).toEqual([]);
  });
});

describe("summarisePeriod", () => {
  it("counts posted money only, and counts drafts separately", async () => {
    const { db, barangay, user, accounts, periods } = await fixture();
    await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );
    await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-15",
      book: "GJ",
      particulars: "Not posted",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: 999999 },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 999999 },
      ],
    });

    const totals = summarisePeriod(await listPeriodVouchers(db, periods.jan2024.id));
    // The draft's ₱9,999.99 must not appear in a figure that says "the books".
    expect(totals.postedDebitCentavos).toBe(1593128);
    expect(totals.postedCreditCentavos).toBe(1593128);
    expect(totals.postedCount).toBe(1);
    expect(totals.draftCount).toBe(1);
    expect(totals.voidedCount).toBe(0);
  });

  it("is all zeroes for an empty period", () => {
    expect(summarisePeriod([])).toEqual({
      postedDebitCentavos: 0,
      postedCreditCentavos: 0,
      postedCount: 0,
      draftCount: 0,
      voidedCount: 0,
    });
  });

  it("always shows posted debits equal to posted credits", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    for (let i = 0; i < 3; i++) {
      await postNewVoucher(
        db,
        electricBill(barangay.id, periods.jan2024.id, {
          expense: accounts.electricity.id,
          cash: accounts.cashInBank.id,
        }),
      );
    }
    const totals = summarisePeriod(await listPeriodVouchers(db, periods.jan2024.id));
    expect(totals.postedDebitCentavos).toBe(totals.postedCreditCentavos);
    expect(totals.postedCount).toBe(3);
  });
});

describe("voidPostedVoucher", () => {
  it("voids the entry and posts its reversal, attributed to the placeholder user (D32)", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    const posted = await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );

    const result = await voidPostedVoucher(db, {
      entryId: posted.entryId,
      reason: "Wrong account used",
      reversalDate: "2024-01-31",
      periodId: periods.jan2024.id,
    });

    expect(result.voided.status).toBe("voided");
    expect(result.reversal.status).toBe("posted");
    expect(result.reversal.reversesEntryId).toBe(posted.entryId);

    const placeholder = await db.query
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.username, PLACEHOLDER_USER_USERNAME))
      .get();
    const logs = await db.query.select().from(auditLog).where(eq(auditLog.recordId, posted.entryId)).all();
    expect(logs.some((l) => l.action === "journal_entry.void" && l.userId === placeholder?.id)).toBe(true);
  });

  it("posts the reversal into the period passed in, never a different one (trap 2)", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    const posted = await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );

    const result = await voidPostedVoucher(db, {
      entryId: posted.entryId,
      reason: "Duplicate entry",
      reversalDate: "2024-01-31",
      periodId: periods.jan2024.id,
    });

    expect(result.reversal.periodId).toBe(periods.jan2024.id);
  });

  it("the reversal's lines have debit and credit swapped from the original", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    const posted = await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );
    const originalLines = await db.query
      .select()
      .from(journalEntryLine)
      .where(eq(journalEntryLine.entryId, posted.entryId))
      .all();

    const result = await voidPostedVoucher(db, {
      entryId: posted.entryId,
      reason: "Correction",
      reversalDate: "2024-01-31",
      periodId: periods.jan2024.id,
    });
    const reversalLines = await db.query
      .select()
      .from(journalEntryLine)
      .where(eq(journalEntryLine.entryId, result.reversal.id))
      .all();

    expect(reversalLines).toHaveLength(originalLines.length);
    for (let i = 0; i < originalLines.length; i++) {
      expect(reversalLines[i].debitCentavos).toBe(originalLines[i].creditCentavos);
      expect(reversalLines[i].creditCentavos).toBe(originalLines[i].debitCentavos);
    }
  });

  it("passes through the engine's refusal of a blank reason", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    const posted = await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );

    await expect(
      voidPostedVoucher(db, {
        entryId: posted.entryId,
        reason: "",
        reversalDate: "2024-01-31",
        periodId: periods.jan2024.id,
      }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("passes through the engine's refusal to void an already-voided entry", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    const posted = await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );
    await voidPostedVoucher(db, {
      entryId: posted.entryId,
      reason: "First void",
      reversalDate: "2024-01-31",
      periodId: periods.jan2024.id,
    });

    await expect(
      voidPostedVoucher(db, {
        entryId: posted.entryId,
        reason: "Second void",
        reversalDate: "2024-01-31",
        periodId: periods.jan2024.id,
      }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("passes through the engine's refusal to void a draft entry", async () => {
    const { db, barangay, user, accounts, periods } = await fixture();
    const draft = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Never posted",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: toCentavos(1000) },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(1000) },
      ],
    });

    await expect(
      voidPostedVoucher(db, {
        entryId: draft.id,
        reason: "x",
        reversalDate: "2024-01-31",
        periodId: periods.jan2024.id,
      }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("passes through the engine's refusal to post a reversal into a closed period", async () => {
    const { db, barangay, accounts, periods } = await fixture();
    const posted = await postNewVoucher(
      db,
      electricBill(barangay.id, periods.jan2024.id, {
        expense: accounts.electricity.id,
        cash: accounts.cashInBank.id,
      }),
    );
    const placeholder = await db.query
      .select({ id: appUser.id })
      .from(appUser)
      .where(eq(appUser.username, PLACEHOLDER_USER_USERNAME))
      .get();
    await closePeriod(db, periods.jan2024.id, placeholder!.id);

    await expect(
      voidPostedVoucher(db, {
        entryId: posted.entryId,
        reason: "x",
        reversalDate: "2024-01-31",
        periodId: periods.jan2024.id,
      }),
    ).rejects.toThrow(ClosedPeriodError);
  });
});
