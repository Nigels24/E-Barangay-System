/**
 * Smoke test for the schema + migrations themselves, before any accounting
 * logic is layered on top. If this file fails, nothing built on top of the
 * database can be trusted either.
 */
import { describe, it, expect } from "vitest";
import { createTestDb } from "../testDb";
import { barangay, account, appUser, journalEntry, journalEntryLine, accountingPeriod } from "../schema";

describe("schema + migrations", () => {
  it("creates all tables and accepts a valid row in each core table", () => {
    const db = createTestDb();

    const [b] = db.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().all();
    expect(b.id).toBeGreaterThan(0);

    const [u] = db
      .insert(appUser)
      .values({ username: "admin", passwordHash: "x", fullName: "Test Admin", role: "admin" })
      .returning()
      .all();

    const [cash] = db
      .insert(account)
      .values({ code: "1-01-02-010", name: "Cash in Bank", accountType: "asset", normalBalance: "debit" })
      .returning()
      .all();
    const [equity] = db
      .insert(account)
      .values({ code: "3-01-01-010", name: "Government Equity", accountType: "equity", normalBalance: "credit" })
      .returning()
      .all();

    const [period] = db
      .insert(accountingPeriod)
      .values({ barangayId: b.id, year: 2024, month: 1 })
      .returning()
      .all();

    const [entry] = db
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

    db.insert(journalEntryLine)
      .values([
        { entryId: entry.id, lineNo: 1, accountId: cash.id, debitCentavos: 100000, creditCentavos: 0 },
        { entryId: entry.id, lineNo: 2, accountId: equity.id, debitCentavos: 0, creditCentavos: 100000 },
      ])
      .run();

    const lines = db.select().from(journalEntryLine).all();
    expect(lines).toHaveLength(2);
  });

  it("rejects a journal line that has both a debit and a credit", () => {
    const { db, entryId, accountId } = seedMinimalDb();

    expect(() =>
      db
        .insert(journalEntryLine)
        .values({ entryId, lineNo: 1, accountId, debitCentavos: 500, creditCentavos: 500 })
        .run(),
    ).toThrow();
  });

  it("rejects a journal line that is entirely zero", () => {
    const { db, entryId, accountId } = seedMinimalDb();

    expect(() =>
      db
        .insert(journalEntryLine)
        .values({ entryId, lineNo: 1, accountId, debitCentavos: 0, creditCentavos: 0 })
        .run(),
    ).toThrow();
  });

  it("rejects an invalid account_type value", () => {
    const db = createTestDb();
    expect(() =>
      db
        .insert(account)
        .values({ code: "X", name: "Bogus", accountType: "not-a-real-type" as any, normalBalance: "debit" })
        .run(),
    ).toThrow();
  });

  it("rejects a voided journal entry with no void reason", () => {
    const { db, entryId } = seedMinimalDb();
    expect(() =>
      db.update(journalEntry).set({ status: "voided" }).where(eq(journalEntry.id, entryId)).run(),
    ).toThrow();
  });
});

/* ---- small local helper to keep the tests above readable ---- */

import { eq } from "drizzle-orm";

function seedMinimalDb() {
  const db = createTestDb();
  const [b] = db.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().all();
  const [u] = db
    .insert(appUser)
    .values({ username: "admin", passwordHash: "x", fullName: "Test Admin", role: "admin" })
    .returning()
    .all();
  const [acct] = db
    .insert(account)
    .values({ code: "1-01-02-010", name: "Cash in Bank", accountType: "asset", normalBalance: "debit" })
    .returning()
    .all();
  const [period] = db
    .insert(accountingPeriod)
    .values({ barangayId: b.id, year: 2024, month: 1 })
    .returning()
    .all();
  const [entry] = db
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
