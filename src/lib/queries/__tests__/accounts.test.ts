import { describe, it, expect } from "vitest";
import { createTestDb } from "../../../db/testDb";
import { account } from "../../../db/schema";
import { runSeed } from "../../../db/seed";
import { CHART_OF_ACCOUNTS_SEED } from "../../../db/seed/accounts";
import { accountLabel, listPostableAccounts } from "../accounts";

describe("listPostableAccounts", () => {
  it("offers the whole seeded chart, ordered by code", async () => {
    const db = createTestDb();
    await runSeed(db);

    const options = await listPostableAccounts(db);
    expect(options).toHaveLength(CHART_OF_ACCOUNTS_SEED.length);

    const codes = options.map((o) => o.code);
    expect([...codes].sort()).toEqual(codes);
    // Code order is also account-type order: assets before expenses.
    expect(codes[0]).toBe("1-01-01-010");
  });

  it("hides an account an administrator has deactivated (D10)", async () => {
    const db = createTestDb();
    await runSeed(db);
    const before = await listPostableAccounts(db);

    await db.query
      .insert(account)
      .values({
        code: "9-99-99-999",
        name: "Retired account",
        accountType: "expense",
        normalBalance: "debit",
        isActive: false,
      })
      .run();

    const after = await listPostableAccounts(db);
    expect(after).toHaveLength(before.length);
    expect(after.some((o) => o.code === "9-99-99-999")).toBe(false);
  });

  it("hides a group header nothing may be posted to", async () => {
    const db = createTestDb();
    await db.query
      .insert(account)
      .values({
        code: "1-07-05",
        name: "Machinery and Equipment",
        accountType: "asset",
        normalBalance: "debit",
        isPostable: false,
      })
      .run();

    expect(await listPostableAccounts(db)).toHaveLength(0);
  });

  it("carries the provisional-code flag through, so a screen can mark it (D12)", async () => {
    const db = createTestDb();
    await runSeed(db);

    const options = await listPostableAccounts(db);
    const provisional = options.filter((o) => o.isProvisionalCode);
    expect(provisional).toHaveLength(CHART_OF_ACCOUNTS_SEED.filter((a) => a.pending).length);
    expect(provisional.every((o) => o.code.startsWith("PENDING-") || o.code === "5-02-11-020")).toBe(
      true,
    );
  });
});

describe("accountLabel", () => {
  it("reads the way the client's own chart does", () => {
    expect(accountLabel({ code: "1-01-02-010", name: "Cash in Bank" })).toBe(
      "1-01-02-010 — Cash in Bank",
    );
  });
});
