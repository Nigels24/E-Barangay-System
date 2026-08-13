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
import { statement, type EngineDb } from "./types";
import { ClosedPeriodError, InvalidStatusError } from "./errors";
import { nextJevNo } from "./numbering";
import { auditStatement } from "./audit";
import { nextRowId } from "./ids";

export interface VoidEntryInput {
  entryId: number;
  reason: string;
  voidedBy: number;
  /** The date the reversal itself is dated — normally today, but the engine takes no implicit clock dependency. */
  reversalDate: string;
  /** Must be an OPEN period in the same barangay as the entry being voided. */
  reversalPeriodId: number;
}

export async function voidEntry(db: EngineDb, input: VoidEntryInput) {
  if (!input.reason.trim()) {
    throw new InvalidStatusError("A reason is required to void a journal entry");
  }

  // ---- Read and validate, before the batch (D30).
  const entry = await db.query.select().from(journalEntry).where(eq(journalEntry.id, input.entryId)).get();
  if (!entry) throw new InvalidStatusError(`Journal entry ${input.entryId} does not exist`);
  if (entry.status !== "posted") {
    throw new InvalidStatusError(`Only a posted entry can be voided (this one is ${entry.status})`);
  }

  const reversalPeriod = await db.query
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

  const originalLines = await db.query
    .select()
    .from(journalEntryLine)
    .where(eq(journalEntryLine.entryId, entry.id))
    .all();

  const reversalId = await nextRowId(db, "journal_entry");
  const jevNo = await nextJevNo(db, entry.barangayId, "GJ", reversalPeriod.year, reversalPeriod.month);

  const voidedFields = {
    status: "voided" as const,
    voidedAt: new Date().toISOString(),
    voidedBy: input.voidedBy,
    voidReason: input.reason,
  };
  const reversalDraft = {
    id: reversalId,
    barangayId: entry.barangayId,
    periodId: input.reversalPeriodId,
    entryDate: input.reversalDate,
    book: "GJ" as const,
    particulars: `Reversal of ${entry.jevNo ?? `JEV #${entry.id}`}: ${input.reason}`,
    status: "draft" as const,
    reversesEntryId: entry.id,
    createdBy: input.voidedBy,
  };
  const postedFields = {
    status: "posted" as const,
    jevNo,
    postedAt: new Date().toISOString(),
    postedBy: input.voidedBy,
  };

  // ---- One batch: voiding an entry and posting its reversal are a single
  // accounting act. Committing half of it would leave the ledger unbalanced by
  // exactly the amount of the voided voucher.
  //
  // The reversal is still inserted as a draft and then updated to posted,
  // rather than inserted posted outright, so the audit trail records the same
  // draft -> posted transition for a reversal as for any other voucher.
  await db.writeBatch([
    statement(db.query.update(journalEntry).set(voidedFields).where(eq(journalEntry.id, entry.id))),
    auditStatement(db, input.voidedBy, "journal_entry.void", "journal_entry", entry.id, entry, {
      ...entry,
      ...voidedFields,
    }),
    statement(db.query.insert(journalEntry).values(reversalDraft)),
    statement(
      db.query.insert(journalEntryLine).values(
        originalLines.map((line, i) => ({
          entryId: reversalId,
          lineNo: i + 1,
          accountId: line.accountId,
          debitCentavos: line.creditCentavos, // sides swapped
          creditCentavos: line.debitCentavos,
          memo: line.memo,
        })),
      ),
    ),
    statement(db.query.update(journalEntry).set(postedFields).where(eq(journalEntry.id, reversalId))),
    auditStatement(db, input.voidedBy, "journal_entry.post", "journal_entry", reversalId, reversalDraft, {
      ...reversalDraft,
      ...postedFields,
    }),
  ]);

  const voided = await db.query.select().from(journalEntry).where(eq(journalEntry.id, entry.id)).get();
  const reversal = await db.query.select().from(journalEntry).where(eq(journalEntry.id, reversalId)).get();
  if (!voided || !reversal) {
    throw new InvalidStatusError("The void wrote successfully but could not be read back");
  }
  return { voided, reversal };
}
