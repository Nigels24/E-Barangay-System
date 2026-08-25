import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "./fixtures";
import { resolveProvisionalCode, setAccountActive } from "../accountsAdmin";
import { InvalidStatusError } from "../errors";
import { account, auditLog } from "../../../db/schema";
import { eq } from "drizzle-orm";

async function seedProvisionalAccount(db: Awaited<ReturnType<typeof seedEngineFixture>>["db"]) {
  return db.query
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
}

describe("resolveProvisionalCode", () => {
  it("replaces the placeholder code and clears isProvisionalCode, audit-logging the write", async () => {
    const { db, admin } = await seedEngineFixture();
    const acct = await seedProvisionalAccount(db);

    const resolved = await resolveProvisionalCode(db, {
      accountId: acct.id,
      newCode: "4-01-04-010",
      resolvedBy: admin.id,
    });

    expect(resolved.code).toBe("4-01-04-010");
    expect(resolved.isProvisionalCode).toBe(false);

    const audit = await db.query.select().from(auditLog).where(eq(auditLog.tableName, "account")).all();
    expect(audit.some((row) => row.action === "account.resolve_provisional_code")).toBe(true);
  });

  it("refuses an account whose code is already confirmed", async () => {
    const { db, admin, accounts } = await seedEngineFixture();
    await expect(
      resolveProvisionalCode(db, { accountId: accounts.cashInBank.id, newCode: "9-99-99-999", resolvedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses a blank code", async () => {
    const { db, admin } = await seedEngineFixture();
    const acct = await seedProvisionalAccount(db);
    await expect(
      resolveProvisionalCode(db, { accountId: acct.id, newCode: "  ", resolvedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses running a second time on the same account", async () => {
    const { db, admin } = await seedEngineFixture();
    const acct = await seedProvisionalAccount(db);
    await resolveProvisionalCode(db, { accountId: acct.id, newCode: "4-01-04-010", resolvedBy: admin.id });

    await expect(
      resolveProvisionalCode(db, { accountId: acct.id, newCode: "4-01-04-020", resolvedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses a code collision with an existing account (schema's own UNIQUE constraint)", async () => {
    const { db, admin, accounts } = await seedEngineFixture();
    const acct = await seedProvisionalAccount(db);
    await expect(
      resolveProvisionalCode(db, { accountId: acct.id, newCode: accounts.cashInBank.code, resolvedBy: admin.id }),
    ).rejects.toThrow();
  });
});

describe("setAccountActive", () => {
  it("deactivates an active account and audit-logs the write", async () => {
    const { db, admin, accounts } = await seedEngineFixture();
    const updated = await setAccountActive(db, {
      accountId: accounts.electricity.id,
      isActive: false,
      changedBy: admin.id,
    });
    expect(updated.isActive).toBe(false);

    const audit = await db.query.select().from(auditLog).where(eq(auditLog.tableName, "account")).all();
    expect(audit.some((row) => row.action === "account.set_active")).toBe(true);
  });

  it("reactivates an inactive account", async () => {
    const { db, admin, accounts } = await seedEngineFixture();
    await setAccountActive(db, { accountId: accounts.electricity.id, isActive: false, changedBy: admin.id });
    const reactivated = await setAccountActive(db, {
      accountId: accounts.electricity.id,
      isActive: true,
      changedBy: admin.id,
    });
    expect(reactivated.isActive).toBe(true);
  });

  it("refuses a no-op (already in the requested state)", async () => {
    const { db, admin, accounts } = await seedEngineFixture();
    await expect(
      setAccountActive(db, { accountId: accounts.electricity.id, isActive: true, changedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });
});
