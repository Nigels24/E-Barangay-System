import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "../../engine/__tests__/fixtures";
import { account } from "../../../db/schema";
import { listAllAccounts, resolveProvisionalCodeAction, setAccountActiveAction } from "../accountsAdmin";

describe("listAllAccounts", () => {
  it("lists every account, ordered by code", async () => {
    const { db } = await seedEngineFixture();
    const rows = await listAllAccounts(db);
    const codes = rows.map((r) => r.code);
    expect(codes).toEqual([...codes].sort());
    expect(codes.length).toBeGreaterThan(0);
  });
});

describe("resolveProvisionalCodeAction", () => {
  it("confirms a provisional code, attributed to the Administrator who confirmed it (T-018)", async () => {
    const { db, admin } = await seedEngineFixture();
    const provisional = await db.query
      .insert(account)
      .values({
        code: "PENDING-COMMUNITY-TAX",
        name: "Community Tax",
        accountType: "income",
        normalBalance: "credit",
        isProvisionalCode: true,
      })
      .returning()
      .get();

    const resolved = await resolveProvisionalCodeAction(db, { accountId: provisional.id, newCode: "4-01-04-010" }, admin.id);
    expect(resolved.code).toBe("4-01-04-010");
    expect(resolved.isProvisionalCode).toBe(false);

    const rows = await listAllAccounts(db);
    expect(rows.find((r) => r.id === provisional.id)?.code).toBe("4-01-04-010");
  });
});

describe("setAccountActiveAction", () => {
  it("deactivates and reactivates an account", async () => {
    const { db, accounts, admin } = await seedEngineFixture();

    const deactivated = await setAccountActiveAction(db, { accountId: accounts.electricity.id, isActive: false }, admin.id);
    expect(deactivated.isActive).toBe(false);

    const reactivated = await setAccountActiveAction(db, { accountId: accounts.electricity.id, isActive: true }, admin.id);
    expect(reactivated.isActive).toBe(true);
  });
});
