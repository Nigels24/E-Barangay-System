/**
 * Smoke test for the schema + migrations themselves, before any accounting
 * logic is layered on top. If this file fails, nothing built on top of the
 * database can be trusted either.
 */
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../testDb";
import { barangay, account, appUser, journalEntry, journalEntryLine, accountingPeriod } from "../schema";

describe("schema + migrations", () => {
  it("creates all tables and accepts a valid row in each core table", async () => {
    const db = createTestDb();

    const [b] = await db.query.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().all();
    expect(b.id).toBeGreaterThan(0);

    const [u] = await db.query
      .insert(appUser)
      .values({ username: "admin", passwordHash: "x", fullName: "Test Admin", role: "admin" })
      .returning()
      .all();

    const [cash] = await db.query
      .insert(account)
      .values({ code: "1-01-02-010", name: "Cash in Bank", accountType: "asset", normalBalance: "debit" })
      .returning()
      .all();
    const [equity] = await db.query
      .insert(account)
      .values({ code: "3-01-01-010", name: "Government Equity", accountType: "equity", normalBalance: "credit" })
      .returning()
      .all();

    const [period] = await db.query
      .insert(accountingPeriod)
      .values({ barangayId: b.id, year: 2024, month: 1 })
      .returning()
      .all();

    const [entry] = await db.query
      .insert(journalEntry)
      .values({
        barangayId: b.id,
        periodId: period.id,
        entryDate: "2024-01-01",
        particulars: "Beginning balance",
        createdBy: u.id,
      })
      .returning()
      .all();

    await db.query
      .insert(journalEntryLine)
      .values([
        { entryId: entry.id, lineNo: 1, accountId: cash.id, debitCentavos: 100000, creditCentavos: 0 },
        { entryId: entry.id, lineNo: 2, accountId: equity.id, debitCentavos: 0, creditCentavos: 100000 },
      ])
      .run();

    const lines = await db.query.select().from(journalEntryLine).all();
    expect(lines).toHaveLength(2);
  });

  it("rejects a journal line that has both a debit and a credit", async () => {
    const { db, entryId, accountId } = await seedMinimalDb();

    await expect(
      db.query
        .insert(journalEntryLine)
        .values({ entryId, lineNo: 1, accountId, debitCentavos: 500, creditCentavos: 500 })
        .run(),
    ).rejects.toThrow();
  });

  it("rejects a journal line that is entirely zero", async () => {
    const { db, entryId, accountId } = await seedMinimalDb();

    await expect(
      db.query
        .insert(journalEntryLine)
        .values({ entryId, lineNo: 1, accountId, debitCentavos: 0, creditCentavos: 0 })
        .run(),
    ).rejects.toThrow();
  });

  it("rejects an invalid account_type value", async () => {
    const db = createTestDb();
    await expect(
      db.query
        .insert(account)
        .values({ code: "X", name: "Bogus", accountType: "not-a-real-type" as never, normalBalance: "debit" })
        .run(),
    ).rejects.toThrow();
  });

  it("rejects a voided journal entry with no void reason", async () => {
    const { db, entryId } = await seedMinimalDb();
    await expect(
      db.query.update(journalEntry).set({ status: "voided" }).where(eq(journalEntry.id, entryId)).run(),
    ).rejects.toThrow();
  });
});

/* ---- small local helper to keep the tests above readable ---- */

async function seedMinimalDb() {
  const db = createTestDb();
  const [b] = await db.query.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().all();
  const [u] = await db.query
    .insert(appUser)
    .values({ username: "admin", passwordHash: "x", fullName: "Test Admin", role: "admin" })
    .returning()
    .all();
  const [acct] = await db.query
    .insert(account)
    .values({ code: "1-01-02-010", name: "Cash in Bank", accountType: "asset", normalBalance: "debit" })
    .returning()
    .all();
  const [period] = await db.query
    .insert(accountingPeriod)
    .values({ barangayId: b.id, year: 2024, month: 1 })
    .returning()
    .all();
  const [entry] = await db.query
    .insert(journalEntry)
    .values({
      barangayId: b.id,
      periodId: period.id,
      entryDate: "2024-01-01",
      particulars: "Test entry",
      createdBy: u.id,
    })
    .returning()
    .all();
  return { db, entryId: entry.id, accountId: acct.id };
}
