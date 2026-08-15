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
