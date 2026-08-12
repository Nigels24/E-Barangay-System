import { describe, it, expect } from "vitest";
import { createTestDb } from "../../testDb";
import { seedAccounts, CHART_OF_ACCOUNTS_SEED, PENDING_ACCOUNT_CODES } from "../accounts";
import { account } from "../../schema";

describe("seedAccounts", () => {
  it("inserts every seed account exactly once", () => {
    const db = createTestDb();
    const inserted = seedAccounts(db);
    expect(inserted).toHaveLength(CHART_OF_ACCOUNTS_SEED.length);

    const rows = db.select().from(account).all();
    expect(rows).toHaveLength(CHART_OF_ACCOUNTS_SEED.length);
  });

  it("is idempotent — running it twice never duplicates or errors", () => {
    const db = createTestDb();
    seedAccounts(db);
    expect(() => seedAccounts(db)).not.toThrow();
    const rows = db.select().from(account).all();
    expect(rows).toHaveLength(CHART_OF_ACCOUNTS_SEED.length);
  });

  it("only inserts what's missing when some accounts already exist", () => {
    const db = createTestDb();
    db.insert(account)
      .values({ code: "1-01-01-010", name: "Cash in Local Treasury", accountType: "asset", normalBalance: "debit" })
      .run();
    const inserted = seedAccounts(db);
    expect(inserted).toHaveLength(CHART_OF_ACCOUNTS_SEED.length - 1);

    const rows = db.select().from(account).all();
    expect(rows).toHaveLength(CHART_OF_ACCOUNTS_SEED.length);
  });

  it("marks every account flagged `pending` in the seed data as provisional, and nothing else", () => {
    const db = createTestDb();
    seedAccounts(db);
    const rows = db.select().from(account).all();

    const provisional = rows.filter((r) => r.isProvisionalCode).map((r) => r.code).sort();
    const expected = CHART_OF_ACCOUNTS_SEED.filter((a) => a.pending).map((a) => a.code).sort();
    expect(provisional).toEqual(expected);
  });

  it("all five no-code placeholders (PENDING_ACCOUNT_CODES) are among the provisional accounts", () => {
    const db = createTestDb();
    seedAccounts(db);
    const rows = db.select().from(account).all();
    const provisional = new Set(rows.filter((r) => r.isProvisionalCode).map((r) => r.code));
    for (const code of Object.values(PENDING_ACCOUNT_CODES)) {
      expect(provisional.has(code)).toBe(true);
    }
  });

  it("every non-pending code follows the real Revised Chart of Accounts numbering, not a placeholder", () => {
    for (const a of CHART_OF_ACCOUNTS_SEED) {
      if (a.pending) continue;
      expect(a.code).toMatch(/^\d-\d{2}-\d{2}-\d{3}A?$/);
    }
  });

  it("no two seed accounts share the same code — the exact defect found in the client's real books", () => {
    const codes = CHART_OF_ACCOUNTS_SEED.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("every seed account satisfies the database's own type and balance constraints", () => {
    // If this throws, seedAccounts is producing a row the schema's own
    // CHECK constraints would reject — a real, not merely theoretical, defect.
    const db = createTestDb();
    expect(() => seedAccounts(db)).not.toThrow();
  });
});
