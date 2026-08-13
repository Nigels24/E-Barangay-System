/**
 * The test that makes decision D30 mean something.
 *
 * D30 exists because a write split across pooled connections can half-commit:
 * the `BEGIN` lands on one connection, the writes on another, and a voucher is
 * left partly written with no error raised. The fix is a batch that runs every
 * statement in one transaction on one connection. Asserting that in a comment
 * proves nothing — this file asserts it against a real database.
 *
 * What this covers and what it does not: these tests exercise the **test
 * adapter** (better-sqlite3). The app adapter routes the identical statement
 * list into `db_execute_batch`, whose Rust holds a single connection for the
 * whole transaction via `pool.begin()`. Vitest cannot reach that Rust — see
 * IMPLEMENTATION_NOTES.md for how the Tauri path is checked by hand.
 */
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../testDb";
import { statement, WriteBatchError } from "../adapter";
import { account, appUser, barangay, journalEntry, journalEntryLine, accountingPeriod } from "../schema";
import { createDraftEntry } from "../../lib/engine/post";
import { UnbalancedEntryError } from "../../lib/engine/errors";

describe("writeBatch atomicity", () => {
  it("commits every statement in a batch that succeeds", async () => {
    const db = createTestDb();

    const results = await db.writeBatch([
      statement(db.query.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" })),
      statement(
        db.query
          .insert(account)
          .values({ code: "1-01-02-010", name: "Cash in Bank", accountType: "asset", normalBalance: "debit" }),
      ),
    ]);

    expect(results).toHaveLength(2);
    expect(await db.query.select().from(barangay).all()).toHaveLength(1);
    expect(await db.query.select().from(account).all()).toHaveLength(1);
  });

  it("leaves the database COMPLETELY unchanged when a later statement fails a CHECK constraint", async () => {
    const db = createTestDb();

    // Statement 0 is perfectly valid on its own. Statement 1 violates the
    // account_type CHECK. If the batch were not atomic, the barangay would
    // survive — that is exactly the half-written state D30 rules out.
    const batch = [
      statement(db.query.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" })),
      statement(
        db.query.insert(account).values({
          code: "X",
          name: "Bogus",
          accountType: "not-a-real-type" as never,
          normalBalance: "debit",
        }),
      ),
    ];

    await expect(db.writeBatch(batch)).rejects.toThrow(WriteBatchError);

    expect(await db.query.select().from(barangay).all()).toHaveLength(0);
    expect(await db.query.select().from(account).all()).toHaveLength(0);
  });

  it("reports which statement in the batch failed", async () => {
    const db = createTestDb();

    const error = await db
      .writeBatch([
        statement(db.query.insert(barangay).values({ code: "A", name: "Barangay A" })),
        statement(db.query.insert(barangay).values({ code: "B", name: "Barangay B" })),
        // Duplicate code — violates the UNIQUE constraint.
        statement(db.query.insert(barangay).values({ code: "A", name: "Barangay A Again" })),
      ])
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(WriteBatchError);
    expect((error as WriteBatchError).statementIndex).toBe(2);
    expect(await db.query.select().from(barangay).all()).toHaveLength(0);
  });

  it("rolls back a failed batch without poisoning the connection for later writes", async () => {
    const db = createTestDb();

    await expect(
      db.writeBatch([
        statement(db.query.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" })),
        statement(db.query.insert(barangay).values({ code: "UPS", name: "Duplicate" })),
      ]),
    ).rejects.toThrow(WriteBatchError);

    await db.writeBatch([statement(db.query.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" }))]);
    expect(await db.query.select().from(barangay).all()).toHaveLength(1);
  });
});

describe("writeBatch atomicity, through the engine", () => {
  /**
   * The case that actually matters in production: a voucher whose lines are
   * rejected by the database must not leave its parent journal_entry row
   * behind. An orphaned header is a voucher that exists with no amounts —
   * invisible on a trial balance, and impossible to explain to an auditor.
   */
  it("a rejected voucher leaves no orphan journal_entry row", async () => {
    const db = createTestDb();

    const [b] = await db.query.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().all();
    const [user] = await db.query
      .insert(appUser)
      .values({ username: "bookkeeper", passwordHash: "x", fullName: "Eugenie Manosur", role: "bookkeeper" })
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

    // Zero-amount lines are refused by the schema's CHECK constraint, so the
    // second statement of the batch fails after the first has already run.
    await expect(
      createDraftEntry(db, {
        barangayId: b.id,
        periodId: period.id,
        entryDate: "2024-01-31",
        book: "GJ",
        particulars: "Voucher that must not survive",
        createdBy: user.id,
        lines: [
          { accountId: cash.id, side: "debit", amountCentavos: 0 },
          { accountId: equity.id, side: "credit", amountCentavos: 0 },
        ],
      }),
    ).rejects.toThrow();

    expect(await db.query.select().from(journalEntry).all()).toHaveLength(0);
    expect(await db.query.select().from(journalEntryLine).all()).toHaveLength(0);
  });

  it("a valid voucher still writes its header and every line together", async () => {
    const db = createTestDb();

    const [b] = await db.query.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().all();
    const [user] = await db.query
      .insert(appUser)
      .values({ username: "bookkeeper", passwordHash: "x", fullName: "Eugenie Manosur", role: "bookkeeper" })
      .returning()
      .all();
    const [cash] = await db.query
      .insert(account)
      .values({ code: "1-01-02-010", name: "Cash in Bank", accountType: "asset", normalBalance: "debit" })
      .returning()
      .all();
    const [electricity] = await db.query
      .insert(account)
      .values({ code: "5-02-04-020", name: "Electricity Expense", accountType: "expense", normalBalance: "debit" })
      .returning()
      .all();
    const [period] = await db.query
      .insert(accountingPeriod)
      .values({ barangayId: b.id, year: 2024, month: 1 })
      .returning()
      .all();

    const draft = await createDraftEntry(db, {
      barangayId: b.id,
      periodId: period.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Payment of electric bill",
      createdBy: user.id,
      lines: [
        { accountId: electricity.id, side: "debit", amountCentavos: 1593128 },
        { accountId: cash.id, side: "credit", amountCentavos: 1593128 },
      ],
    });

    const lines = await db.query.select().from(journalEntryLine).where(eq(journalEntryLine.entryId, draft.id)).all();
    expect(lines).toHaveLength(2);
    // The id allocated before the batch is the id the row actually got.
    expect(draft.id).toBeGreaterThan(0);
  });

  it("still refuses a one-line voucher before any statement is built", async () => {
    const db = createTestDb();
    const [b] = await db.query.insert(barangay).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().all();
    const [user] = await db.query
      .insert(appUser)
      .values({ username: "bookkeeper", passwordHash: "x", fullName: "Eugenie Manosur", role: "bookkeeper" })
      .returning()
      .all();
    const [cash] = await db.query
      .insert(account)
      .values({ code: "1-01-02-010", name: "Cash in Bank", accountType: "asset", normalBalance: "debit" })
      .returning()
      .all();
    const [period] = await db.query
      .insert(accountingPeriod)
      .values({ barangayId: b.id, year: 2024, month: 1 })
      .returning()
      .all();

    await expect(
      createDraftEntry(db, {
        barangayId: b.id,
        periodId: period.id,
        entryDate: "2024-01-31",
        book: "GJ",
        particulars: "Half a voucher",
        createdBy: user.id,
        lines: [{ accountId: cash.id, side: "debit", amountCentavos: 100 }],
      }),
    ).rejects.toThrow(UnbalancedEntryError);

    expect(await db.query.select().from(journalEntry).all()).toHaveLength(0);
  });
});
