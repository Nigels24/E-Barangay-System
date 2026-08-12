/**
 * Voiding a posted entry. Deletion is never physical (see schema.ts) — a
 * void marks the original entry voided-with-reason and immediately posts a
 * reversing entry with every line's debit/credit swapped, so the ledger's
 * net effect becomes zero without a single row ever being removed.
 *
 * The reversal always books to the General Journal (GJ), regardless of
 * what book the original entry was in. Two reasons: it matches the
 * client's own taxonomy (GJ = adjustments, per the City Accountant's own
 * note — see docs/decisions.md), and it sidesteps the schema's rule that a
 * posted CkDJ entry must carry a real check number and date (D16) — a
 * reversal isn't a new check, so it has none to carry.
 */
import { eq } from "drizzle-orm";
import { accountingPeriod, journalEntry, journalEntryLine } from "../../db/schema";
import type { EngineDb } from "./types";
import { ClosedPeriodError, InvalidStatusError } from "./errors";
import { nextJevNo } from "./numbering";
import { writeAudit } from "./audit";

export interface VoidEntryInput {
  entryId: number;
  reason: string;
  voidedBy: number;
  /** The date the reversal itself is dated — normally today, but the engine takes no implicit clock dependency. */
  reversalDate: string;
  /** Must be an OPEN period in the same barangay as the entry being voided. */
  reversalPeriodId: number;
}

export function voidEntry(db: EngineDb, input: VoidEntryInput) {
  if (!input.reason.trim()) {
    throw new InvalidStatusError("A reason is required to void a journal entry");
  }

  return db.transaction((tx) => {
    const entry = tx.select().from(journalEntry).where(eq(journalEntry.id, input.entryId)).get();
    if (!entry) throw new InvalidStatusError(`Journal entry ${input.entryId} does not exist`);
    if (entry.status !== "posted") {
      throw new InvalidStatusError(`Only a posted entry can be voided (this one is ${entry.status})`);
    }

    const reversalPeriod = tx
      .select()
      .from(accountingPeriod)
      .where(eq(accountingPeriod.id, input.reversalPeriodId))
      .get();
    if (!reversalPeriod) throw new InvalidStatusError(`Period ${input.reversalPeriodId} does not exist`);
    if (reversalPeriod.barangayId !== entry.barangayId) {
      throw new InvalidStatusError("The reversal period must belong to the same barangay as the voided entry");
    }
    if (reversalPeriod.status !== "open") {
      throw new ClosedPeriodError(`Cannot post a reversal into closed period ${reversalPeriod.year}-${reversalPeriod.month}`);
    }

    const originalLines = tx.select().from(journalEntryLine).where(eq(journalEntryLine.entryId, entry.id)).all();

    const voidedEntry = tx
      .update(journalEntry)
      .set({ status: "voided", voidedAt: new Date().toISOString(), voidedBy: input.voidedBy, voidReason: input.reason })
      .where(eq(journalEntry.id, entry.id))
      .returning()
      .get();
    writeAudit(tx, input.voidedBy, "journal_entry.void", "journal_entry", entry.id, entry, voidedEntry);

    const reversal = tx
      .insert(journalEntry)
      .values({
        barangayId: entry.barangayId,
        periodId: input.reversalPeriodId,
        entryDate: input.reversalDate,
        book: "GJ",
        particulars: `Reversal of ${entry.jevNo ?? `JEV #${entry.id}`}: ${input.reason}`,
        status: "draft",
        reversesEntryId: entry.id,
        createdBy: input.voidedBy,
      })
      .returning()
      .get();

    tx.insert(journalEntryLine)
      .values(
        originalLines.map((line, i) => ({
          entryId: reversal.id,
          lineNo: i + 1,
          accountId: line.accountId,
          debitCentavos: line.creditCentavos, // sides swapped
          creditCentavos: line.debitCentavos,
          memo: line.memo,
        })),
      )
      .run();

    const jevNo = nextJevNo(tx, reversal.barangayId, reversal.book, reversalPeriod.year, reversalPeriod.month);
    const postedReversal = tx
      .update(journalEntry)
      .set({ status: "posted", jevNo, postedAt: new Date().toISOString(), postedBy: input.voidedBy })
      .where(eq(journalEntry.id, reversal.id))
      .returning()
      .get();
    writeAudit(tx, input.voidedBy, "journal_entry.post", "journal_entry", reversal.id, reversal, postedReversal);

    return { voided: voidedEntry, reversal: postedReversal };
  });
}
