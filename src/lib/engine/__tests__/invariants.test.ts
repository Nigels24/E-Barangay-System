/**
 * Cross-cutting invariants for the ledger engine, per the plan's Task 9:
 *   - many posted vouchers still balance globally, not just individually
 *   - a General Ledger's closing balance always agrees with its Trial Balance line
 *   - a posted entry cannot be deleted through any path, not even bypassing the engine
 *
 * Single-voucher rejection cases (unbalanced voucher, closed period, missing
 * check details, double posting, etc.) are already covered in post.test.ts
 * and void.test.ts — this file is for invariants that only show up once
 * many entries exist together.
 */
import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { seedEngineFixture } from "./fixtures";
import { createDraftEntry, postEntry } from "../post";
import { account, journalEntry, journalEntryLine, auditLog } from "../../../db/schema";
import { buildTrialBalance } from "../../reports/trialBalance";
import { buildGeneralLedger } from "../../reports/generalLedger";
import { sumCentavos } from "../../money";

/** Deterministic PRNG (mulberry32) so the random-voucher test is reproducible, never flaky. */
function mulberry32(seed: number) {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Splits `total` into `n` positive integer parts that sum exactly to `total`. */
function splitInto(total: number, n: number, rand: () => number): number[] {
  if (n === 1) return [total];
  const cuts = new Set<number>();
  while (cuts.size < n - 1) cuts.add(1 + Math.floor(rand() * (total - 1)));
  const sorted = [0, ...[...cuts].sort((a, b) => a - b), total];
  const parts: number[] = [];
  for (let i = 1; i < sorted.length; i++) parts.push(sorted[i] - sorted[i - 1]);
  return parts;
}

describe("global invariant: many posted vouchers still balance in aggregate", () => {
  it("total debits equal total credits across 50 randomly generated vouchers", () => {
    const { db, barangay, user, periods } = seedEngineFixture();
    const rand = mulberry32(20240115);

    // A handful of accounts covering every normal balance, touched repeatedly.
    const accountIds = [
      db.insert(account).values({ code: "A1", name: "Asset One", accountType: "asset", normalBalance: "debit" }).returning().get().id,
      db.insert(account).values({ code: "A2", name: "Asset Two", accountType: "asset", normalBalance: "debit" }).returning().get().id,
      db.insert(account).values({ code: "L1", name: "Liability One", accountType: "liability", normalBalance: "credit" }).returning().get().id,
      db.insert(account).values({ code: "I1", name: "Income One", accountType: "income", normalBalance: "credit" }).returning().get().id,
      db.insert(account).values({ code: "E1", name: "Expense One", accountType: "expense", normalBalance: "debit" }).returning().get().id,
    ];

    for (let i = 0; i < 50; i++) {
      const debitLineCount = 1 + Math.floor(rand() * 3);
      const creditLineCount = 1 + Math.floor(rand() * 3);
      const total = 100 + Math.floor(rand() * 900_000);
      const debitParts = splitInto(total, debitLineCount, rand);
      const creditParts = splitInto(total, creditLineCount, rand);

      const pick = () => accountIds[Math.floor(rand() * accountIds.length)];
      const draft = createDraftEntry(db, {
        barangayId: barangay.id,
        periodId: periods.jan2024.id,
        entryDate: "2024-01-15",
        book: "GJ",
        particulars: `Random voucher ${i}`,
        createdBy: user.id,
        lines: [
          ...debitParts.map((amountCentavos) => ({ accountId: pick(), side: "debit" as const, amountCentavos })),
          ...creditParts.map((amountCentavos) => ({ accountId: pick(), side: "credit" as const, amountCentavos })),
        ],
      });
      postEntry(db, { entryId: draft.id, postedBy: user.id });
    }

    const allLines = db
      .select({ debitCentavos: journalEntryLine.debitCentavos, creditCentavos: journalEntryLine.creditCentavos })
      .from(journalEntryLine)
      .innerJoin(journalEntry, eq(journalEntryLine.entryId, journalEntry.id))
      .where(eq(journalEntry.barangayId, barangay.id))
      .all();

    const totalDebit = sumCentavos(allLines.map((l) => l.debitCentavos));
    const totalCredit = sumCentavos(allLines.map((l) => l.creditCentavos));
    expect(totalDebit).toBe(totalCredit);

    // The Trial Balance nets each account down to one balance, so its total
    // is generally SMALLER than raw gross turnover whenever an account
    // receives both debits and credits across different vouchers — that's
    // expected, not a bug. What must still hold is its own internal
    // identity: net debit balances and net credit balances agree with
    // each other.
    const tb = buildTrialBalance(db, barangay.id, 2024, 1);
    expect(tb.totalDebitCentavos).toBe(tb.totalCreditCentavos);
  });
});

describe("global invariant: General Ledger closing balance always equals its Trial Balance line", () => {
  it("holds for every account touched by a mix of multi-line vouchers", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();

    const post = (lines: { accountId: number; side: "debit" | "credit"; amountCentavos: number }[]) =>
      postEntry(db, {
        entryId: createDraftEntry(db, {
          barangayId: barangay.id,
          periodId: periods.jan2024.id,
          entryDate: "2024-01-20",
          book: "GJ",
          particulars: "Mixed activity",
          createdBy: user.id,
          lines,
        }).id,
        postedBy: user.id,
      });

    post([
      { accountId: accounts.electricity.id, side: "debit", amountCentavos: 5000 },
      { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 5000 },
    ]);
    post([
      { accountId: accounts.cashInBank.id, side: "debit", amountCentavos: 20000 },
      { accountId: accounts.ira.id, side: "credit", amountCentavos: 12000 },
      { accountId: accounts.equity.id, side: "credit", amountCentavos: 8000 },
    ]);
    post([
      { accountId: accounts.electricity.id, side: "debit", amountCentavos: 1500 },
      { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 1500 },
    ]);

    const tb = buildTrialBalance(db, barangay.id, 2024, 1);

    for (const acctId of [accounts.cashInBank.id, accounts.electricity.id, accounts.ira.id, accounts.equity.id]) {
      const gl = buildGeneralLedger(db, barangay.id, acctId, 2024, 1);
      const tbRow = tb.rows.find((r) => r.accountId === acctId);
      const tbSigned = tbRow ? tbRow.debitCentavos - tbRow.creditCentavos : 0;
      expect(gl.closingBalanceCentavos).toBe(tbSigned);
    }
  });
});

describe("invariant: a posted entry cannot be deleted through any path", () => {
  function postSimpleEntry(fixture: ReturnType<typeof seedEngineFixture>) {
    const { db, barangay, user, accounts, periods } = fixture;
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Protected entry",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: 1000 },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 1000 },
      ],
    });
    return postEntry(db, { entryId: draft.id, postedBy: user.id });
  }

  it("refuses a direct SQL delete of a posted entry, bypassing the engine entirely", () => {
    const fixture = seedEngineFixture();
    const posted = postSimpleEntry(fixture);
    expect(() => fixture.db.delete(journalEntry).where(eq(journalEntry.id, posted.id)).run()).toThrow();
  });

  it("refuses a direct SQL delete of a posted entry's lines", () => {
    const fixture = seedEngineFixture();
    const posted = postSimpleEntry(fixture);
    expect(() =>
      fixture.db.delete(journalEntryLine).where(eq(journalEntryLine.entryId, posted.id)).run(),
    ).toThrow();
  });

  it("still allows deleting a draft that was never posted — there is no ledger effect to protect yet", () => {
    const { db, barangay, user, accounts, periods } = seedEngineFixture();
    const draft = createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Never posted",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: 1000 },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: 1000 },
      ],
    });
    expect(() => db.delete(journalEntryLine).where(eq(journalEntryLine.entryId, draft.id)).run()).not.toThrow();
    expect(() => db.delete(journalEntry).where(eq(journalEntry.id, draft.id)).run()).not.toThrow();
  });

  it("the audit trail itself can never be deleted from or modified, not even by an admin", () => {
    const fixture = seedEngineFixture();
    postSimpleEntry(fixture);
    const log = fixture.db.select().from(auditLog).limit(1).get()!;
    expect(() => fixture.db.delete(auditLog).where(eq(auditLog.id, log.id)).run()).toThrow();
    expect(() =>
      fixture.db.update(auditLog).set({ action: "tampered" }).where(eq(auditLog.id, log.id)).run(),
    ).toThrow();
  });
});
