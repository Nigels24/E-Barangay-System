import { describe, it, expect } from "vitest";
import { createTestDb } from "../../../db/testDb";
import { createDraftEntry, postEntry } from "../../engine/post";
import { ensurePeriod } from "../../engine/period";
import { account, appUser, barangay } from "../../../db/schema";
import { seedAccounts, CHART_OF_ACCOUNTS_SEED } from "../../../db/seed/accounts";
import { buildTrialBalance } from "../trialBalance";

describe("buildTrialBalance carries the provisional-code flag through (D12)", () => {
  it("marks a provisional account's row, and leaves a confirmed one unmarked", async () => {
    const db = createTestDb();
    const b = await db.query.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().get();
    const admin = await db.query
      .insert(appUser)
      .values({ username: "admin", passwordHash: "x", fullName: "Test Admin", role: "admin" })
      .returning()
      .get();
    await seedAccounts(db);
    const seeded = await db.query.select().from(account).all();

    const provisionalCode = CHART_OF_ACCOUNTS_SEED.find((a) => a.pending)!.code;
    const confirmedCode = CHART_OF_ACCOUNTS_SEED.find((a) => !a.pending)!.code;
    const provisionalAccount = seeded.find((a) => a.code === provisionalCode)!;
    const confirmedAccount = seeded.find((a) => a.code === confirmedCode)!;

    const period = await ensurePeriod(db, b.id, 2024, 1);
    const draft = await createDraftEntry(db, {
      barangayId: b.id,
      periodId: period.id,
      entryDate: "2024-01-15",
      book: "GJ",
      particulars: "Test entry touching a provisional account",
      createdBy: admin.id,
      lines: [
        { accountId: provisionalAccount.id, side: "debit", amountCentavos: 10000 },
        { accountId: confirmedAccount.id, side: "credit", amountCentavos: 10000 },
      ],
    });
    await postEntry(db, { entryId: draft.id, postedBy: admin.id });

    const result = await buildTrialBalance(db, b.id, 2024, 1);
    const provisionalRow = result.rows.find((r) => r.code === provisionalCode);
    const confirmedRow = result.rows.find((r) => r.code === confirmedCode);

    expect(provisionalRow?.isProvisionalCode).toBe(true);
    expect(confirmedRow?.isProvisionalCode).toBe(false);
  });
});

describe("buildTrialBalance's hasPostedLines flag distinguishes 'nothing posted' from 'everything nets to zero'", () => {
  it("is false for a period with no posted activity at all", async () => {
    const db = createTestDb();
    const b = await db.query.insert(barangay).values({ code: "EMP", name: "Barangay Empty" }).returning().get();
    await seedAccounts(db);

    const result = await buildTrialBalance(db, b.id, 2024, 1);

    expect(result.rows).toEqual([]);
    expect(result.hasPostedLines).toBe(false);
  });

  it("is true when posted lines exist but every account nets to zero", async () => {
    const db = createTestDb();
    const b = await db.query.insert(barangay).values({ code: "NET", name: "Barangay Net Zero" }).returning().get();
    const admin = await db.query
      .insert(appUser)
      .values({ username: "admin2", passwordHash: "x", fullName: "Test Admin 2", role: "admin" })
      .returning()
      .get();
    await seedAccounts(db);
    const seeded = await db.query.select().from(account).all();
    const codeA = CHART_OF_ACCOUNTS_SEED[0].code;
    const codeB = CHART_OF_ACCOUNTS_SEED[1].code;
    const accountA = seeded.find((a) => a.code === codeA)!;
    const accountB = seeded.find((a) => a.code === codeB)!;

    const period = await ensurePeriod(db, b.id, 2024, 1);
    // Two balanced entries on the same account that fully offset it —
    // real posted activity that nets to exactly zero.
    const draft1 = await createDraftEntry(db, {
      barangayId: b.id,
      periodId: period.id,
      entryDate: "2024-01-10",
      book: "GJ",
      particulars: "Post then reverse the same account",
      createdBy: admin.id,
      lines: [
        { accountId: accountA.id, side: "debit", amountCentavos: 10000 },
        { accountId: accountB.id, side: "credit", amountCentavos: 10000 },
      ],
    });
    await postEntry(db, { entryId: draft1.id, postedBy: admin.id });

    const draft2 = await createDraftEntry(db, {
      barangayId: b.id,
      periodId: period.id,
      entryDate: "2024-01-11",
      book: "GJ",
      particulars: "Offsetting entry so the net is zero",
      createdBy: admin.id,
      lines: [
        { accountId: accountA.id, side: "credit", amountCentavos: 10000 },
        { accountId: accountB.id, side: "debit", amountCentavos: 10000 },
      ],
    });
    await postEntry(db, { entryId: draft2.id, postedBy: admin.id });

    const result = await buildTrialBalance(db, b.id, 2024, 1);

    expect(result.rows).toEqual([]);
    expect(result.hasPostedLines).toBe(true);
  });
});
