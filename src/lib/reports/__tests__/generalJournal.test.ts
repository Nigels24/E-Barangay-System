import { describe, it, expect } from "vitest";
import { createTestDb } from "../../../db/testDb";
import { createDraftEntry, postEntry } from "../../engine/post";
import { voidEntry } from "../../engine/void";
import { ensurePeriod } from "../../engine/period";
import { account, appUser, barangay as barangayTable } from "../../../db/schema";
import { seedAccounts } from "../../../db/seed/accounts";
import { buildGeneralJournal } from "../generalJournal";

async function setUp() {
  const db = createTestDb();
  const b = await db.query.insert(barangayTable).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().get();
  const admin = await db.query
    .insert(appUser)
    .values({ username: "admin", passwordHash: "x", fullName: "Test Admin", role: "admin" })
    .returning()
    .get();
  await seedAccounts(db);
  const accounts = await db.query.select().from(account).all();
  const cash = accounts.find((a) => a.code === "1-01-01-010")!;
  const equity = accounts.find((a) => a.code === "3-01-01-010")!;
  return { db, barangay: b, admin, cash, equity };
}

describe("buildGeneralJournal", () => {
  it("is empty for a period with no posted GJ activity", async () => {
    const { db, barangay } = await setUp();
    await ensurePeriod(db, barangay.id, 2024, 1);

    const result = await buildGeneralJournal(db, barangay.id, 2024, 1);

    expect(result.entries).toEqual([]);
    expect(result.totalDebitCentavos).toBe(0);
    expect(result.totalCreditCentavos).toBe(0);
  });

  it("lists a posted GJ entry with its lines and totals", async () => {
    const { db, barangay, admin, cash, equity } = await setUp();
    const period = await ensurePeriod(db, barangay.id, 2024, 1);
    const draft = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: period.id,
      entryDate: "2024-01-15",
      book: "GJ",
      particulars: "Opening cash",
      createdBy: admin.id,
      lines: [
        { accountId: cash.id, side: "debit", amountCentavos: 50000 },
        { accountId: equity.id, side: "credit", amountCentavos: 50000 },
      ],
    });
    await postEntry(db, { entryId: draft.id, postedBy: admin.id });

    const result = await buildGeneralJournal(db, barangay.id, 2024, 1);

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0].entryDate).toBe("2024-01-15");
    expect(result.entries[0].particulars).toBe("Opening cash");
    expect(result.entries[0].lines).toHaveLength(2);
    expect(result.entries[0].lines[0]).toMatchObject({ accountCode: "1-01-01-010", debitCentavos: 50000, creditCentavos: 0 });
    expect(result.entries[0].lines[1]).toMatchObject({ accountCode: "3-01-01-010", debitCentavos: 0, creditCentavos: 50000 });
    expect(result.totalDebitCentavos).toBe(50000);
    expect(result.totalCreditCentavos).toBe(50000);
  });

  it("orders multiple entries chronologically, not by insertion order", async () => {
    const { db, barangay, admin, cash, equity } = await setUp();
    const period = await ensurePeriod(db, barangay.id, 2024, 1);

    const later = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: period.id,
      entryDate: "2024-01-25",
      book: "GJ",
      particulars: "Later entry",
      createdBy: admin.id,
      lines: [
        { accountId: cash.id, side: "debit", amountCentavos: 1000 },
        { accountId: equity.id, side: "credit", amountCentavos: 1000 },
      ],
    });
    await postEntry(db, { entryId: later.id, postedBy: admin.id });

    const earlier = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: period.id,
      entryDate: "2024-01-05",
      book: "GJ",
      particulars: "Earlier entry",
      createdBy: admin.id,
      lines: [
        { accountId: cash.id, side: "debit", amountCentavos: 2000 },
        { accountId: equity.id, side: "credit", amountCentavos: 2000 },
      ],
    });
    await postEntry(db, { entryId: earlier.id, postedBy: admin.id });

    const result = await buildGeneralJournal(db, barangay.id, 2024, 1);

    expect(result.entries.map((e) => e.particulars)).toEqual(["Earlier entry", "Later entry"]);
  });

  it("excludes drafts, entries outside the month, entries in another book, and another barangay's entries", async () => {
    const { db, barangay, admin, cash, equity } = await setUp();
    const period = await ensurePeriod(db, barangay.id, 2024, 1);
    const otherPeriod = await ensurePeriod(db, barangay.id, 2024, 2);
    const otherBarangay = await db.query.insert(barangayTable).values({ code: "OTH", name: "Barangay Other" }).returning().get();
    const otherBarangayPeriod = await ensurePeriod(db, otherBarangay.id, 2024, 1);

    // Draft, never posted.
    await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: period.id,
      entryDate: "2024-01-10",
      book: "GJ",
      particulars: "Never posted",
      createdBy: admin.id,
      lines: [
        { accountId: cash.id, side: "debit", amountCentavos: 100 },
        { accountId: equity.id, side: "credit", amountCentavos: 100 },
      ],
    });

    // Posted, but in February.
    const februaryEntry = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: otherPeriod.id,
      entryDate: "2024-02-01",
      book: "GJ",
      particulars: "Next month",
      createdBy: admin.id,
      lines: [
        { accountId: cash.id, side: "debit", amountCentavos: 200 },
        { accountId: equity.id, side: "credit", amountCentavos: 200 },
      ],
    });
    await postEntry(db, { entryId: februaryEntry.id, postedBy: admin.id });

    // Posted, but in the Cash Receipts Journal, not GJ.
    const crjEntry = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: period.id,
      entryDate: "2024-01-12",
      book: "CRJ",
      particulars: "Cash receipt",
      createdBy: admin.id,
      lines: [
        { accountId: cash.id, side: "debit", amountCentavos: 300 },
        { accountId: equity.id, side: "credit", amountCentavos: 300 },
      ],
    });
    await postEntry(db, { entryId: crjEntry.id, postedBy: admin.id });

    // Posted, correct month and book, but a different barangay.
    const otherBarangayEntry = await createDraftEntry(db, {
      barangayId: otherBarangay.id,
      periodId: otherBarangayPeriod.id,
      entryDate: "2024-01-12",
      book: "GJ",
      particulars: "Other barangay",
      createdBy: admin.id,
      lines: [
        { accountId: cash.id, side: "debit", amountCentavos: 400 },
        { accountId: equity.id, side: "credit", amountCentavos: 400 },
      ],
    });
    await postEntry(db, { entryId: otherBarangayEntry.id, postedBy: admin.id });

    const result = await buildGeneralJournal(db, barangay.id, 2024, 1);

    expect(result.entries).toEqual([]);
  });

  it("a voided entry drops out, but its GJ reversal appears in its own posting month", async () => {
    const { db, barangay, admin, cash, equity } = await setUp();
    const period = await ensurePeriod(db, barangay.id, 2024, 1);
    const draft = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: period.id,
      entryDate: "2024-01-10",
      book: "CDJ",
      particulars: "Disbursement to be voided",
      createdBy: admin.id,
      lines: [
        { accountId: cash.id, side: "credit", amountCentavos: 5000 },
        { accountId: equity.id, side: "debit", amountCentavos: 5000 },
      ],
    });
    const posted = await postEntry(db, { entryId: draft.id, postedBy: admin.id });

    await voidEntry(db, {
      entryId: posted.id,
      reason: "Entered in error",
      voidedBy: admin.id,
      reversalDate: "2024-01-20",
      reversalPeriodId: period.id,
    });

    const result = await buildGeneralJournal(db, barangay.id, 2024, 1);

    // The original was never in GJ (it was CDJ) and is now voided either way — excluded.
    expect(result.entries.some((e) => e.particulars === "Disbursement to be voided")).toBe(false);
    // The reversal always books to GJ (void.ts) regardless of the original's book.
    const reversal = result.entries.find((e) => e.particulars.startsWith("Reversal of"));
    expect(reversal).toBeDefined();
    expect(reversal!.entryDate).toBe("2024-01-20");
    expect(reversal!.particulars).toContain("Entered in error");
  });
});
