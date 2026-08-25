import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "../../engine/__tests__/fixtures";
import { seedPlaceholderUser } from "../../../db/seed/users";
import { account } from "../../../db/schema";
import { listAllAccounts, resolveProvisionalCodeAction, setAccountActiveAction } from "../accountsAdmin";

async function seedForWrites() {
  const fixture = await seedEngineFixture();
  await seedPlaceholderUser(fixture.db);
  return fixture;
}

describe("listAllAccounts", () => {
  it("lists every account, ordered by code", async () => {
    const { db } = await seedForWrites();
    const rows = await listAllAccounts(db);
    const codes = rows.map((r) => r.code);
    expect(codes).toEqual([...codes].sort());
    expect(codes.length).toBeGreaterThan(0);
  });
});

describe("resolveProvisionalCodeAction", () => {
  it("confirms a provisional code, resolving the placeholder actor (D32) without a screen ever passing one", async () => {
    const { db } = await seedForWrites();
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

    const resolved = await resolveProvisionalCodeAction(db, { accountId: provisional.id, newCode: "4-01-04-010" });
    expect(resolved.code).toBe("4-01-04-010");
    expect(resolved.isProvisionalCode).toBe(false);

    const rows = await listAllAccounts(db);
    expect(rows.find((r) => r.id === provisional.id)?.code).toBe("4-01-04-010");
  });
});

describe("setAccountActiveAction", () => {
  it("deactivates and reactivates an account", async () => {
    const { db, accounts } = await seedForWrites();

    const deactivated = await setAccountActiveAction(db, { accountId: accounts.electricity.id, isActive: false });
    expect(deactivated.isActive).toBe(false);

    const reactivated = await setAccountActiveAction(db, { accountId: accounts.electricity.id, isActive: true });
    expect(reactivated.isActive).toBe(true);
  });
});
