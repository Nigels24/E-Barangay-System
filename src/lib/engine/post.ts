/**
 * Voucher creation and posting — the core of the whole system.
 *
 * A voucher is not "real" (cannot affect any report) until it is posted.
 * Creating a draft never touches the ledger and is intentionally permissive
 * — a draft can be temporarily unbalanced while the bookkeeper is still
 * typing, which is what lets the system pre-fill a voucher for review
 * (docs/decisions.md D5/D19/D23) without that draft silently corrupting
 * anything. All of the real invariants are enforced at the one gate that
 * matters: postEntry.
 */
import { eq } from "drizzle-orm";
import { accountingPeriod, journalEntry, journalEntryLine, type JournalBook } from "../../db/schema";
import { statement, type EngineDb } from "./types";
import { ClosedPeriodError, InvalidStatusError, MissingCheckDetailsError, UnbalancedEntryError } from "./errors";
import { nextJevNo } from "./numbering";
import { auditStatement } from "./audit";
import { nextRowId } from "./ids";
import { formatPeso, sumCentavos } from "../money";

export interface DraftLineInput {
  accountId: number;
  side: "debit" | "credit";
  amountCentavos: number;
  memo?: string;
}

export interface CreateDraftEntryInput {
  barangayId: number;
  periodId: number;
  entryDate: string; // ISO date
  book: JournalBook;
  particulars: string;
  lines: DraftLineInput[];
  createdBy: number;
  checkNo?: string;
  checkDate?: string;
  bankAccountId?: number;
}

/** Creates a draft voucher with its lines. Does not touch the ledger. */
export async function createDraftEntry(db: EngineDb, input: CreateDraftEntryInput) {
  if (input.lines.length < 2) {
    throw new UnbalancedEntryError("A voucher needs at least two lines");
  }

  // The lines reference the entry, so its id has to be known before the batch
  // is built — see ids.ts for why it is allocated here rather than read back.
  const entryId = await nextRowId(db, "journal_entry");

  await db.writeBatch([
    statement(
      db.query.insert(journalEntry).values({
        id: entryId,
        barangayId: input.barangayId,
        periodId: input.periodId,
        entryDate: input.entryDate,
        book: input.book,
        particulars: input.particulars,
        createdBy: input.createdBy,
        checkNo: input.checkNo,
        checkDate: input.checkDate,
        bankAccountId: input.bankAccountId,
        status: "draft",
      }),
    ),
    statement(
      db.query.insert(journalEntryLine).values(
        input.lines.map((line, i) => ({
          entryId,
          lineNo: i + 1,
          accountId: line.accountId,
          debitCentavos: line.side === "debit" ? line.amountCentavos : 0,
          creditCentavos: line.side === "credit" ? line.amountCentavos : 0,
          memo: line.memo,
        })),
      ),
    ),
  ]);

  return readEntry(db, entryId);
}

/** Reads a journal entry back after a write, so callers still get the stored row. */
async function readEntry(db: EngineDb, entryId: number) {
  const entry = await db.query.select().from(journalEntry).where(eq(journalEntry.id, entryId)).get();
  if (!entry) throw new InvalidStatusError(`Journal entry ${entryId} disappeared after being written`);
  return entry;
}

export interface PostEntryInput {
  entryId: number;
  postedBy: number;
}

/**
 * Posts a draft voucher. Refuses unless: the entry is a draft, its period
 * is open, its lines balance to a non-zero amount, and — for a Check
 * Disbursement — a check number and date are already present (D16).
 * Everything happens in one transaction: the ledger is either fully updated
 * or not touched at all, even if the process is killed mid-post.
 */
export async function postEntry(db: EngineDb, input: PostEntryInput) {
  // ---- Read and validate. Per D30 these reads now happen just BEFORE the
  // write batch rather than inside the transaction. On a single-user office PC
  // there is no concurrent writer to race with, and the schema's constraints
  // and append-only triggers still backstop every invariant regardless.
  const entry = await db.query.select().from(journalEntry).where(eq(journalEntry.id, input.entryId)).get();
  if (!entry) throw new InvalidStatusError(`Journal entry ${input.entryId} does not exist`);
  if (entry.status !== "draft") {
    throw new InvalidStatusError(`Journal entry ${input.entryId} is ${entry.status}, not draft`);
  }

  const period = await db.query
    .select()
    .from(accountingPeriod)
    .where(eq(accountingPeriod.id, entry.periodId))
    .get();
  if (!period) throw new InvalidStatusError(`Period ${entry.periodId} does not exist`);
  if (period.status !== "open") {
    throw new ClosedPeriodError(`Period ${period.year}-${period.month} is closed`);
  }
  const expectedMonthPrefix = `${period.year}-${String(period.month).padStart(2, "0")}`;
  if (!entry.entryDate.startsWith(expectedMonthPrefix)) {
    throw new InvalidStatusError(
      `Entry date ${entry.entryDate} does not fall within its assigned period ${expectedMonthPrefix}`,
    );
  }

  const lines = await db.query
    .select()
    .from(journalEntryLine)
    .where(eq(journalEntryLine.entryId, entry.id))
    .all();
  if (lines.length === 0) throw new UnbalancedEntryError("Cannot post a voucher with no lines");

  const totalDebit = sumCentavos(lines.map((l) => l.debitCentavos));
  const totalCredit = sumCentavos(lines.map((l) => l.creditCentavos));
  if (totalDebit !== totalCredit) {
    throw new UnbalancedEntryError(
      `Debits ${formatPeso(totalDebit)} do not equal credits ${formatPeso(totalCredit)}`,
    );
  }
  if (totalDebit === 0) {
    throw new UnbalancedEntryError("A voucher cannot post with a zero amount");
  }

  if (entry.book === "CkDJ" && (!entry.checkNo || !entry.checkDate)) {
    throw new MissingCheckDetailsError(
      "Check disbursements require a check number and check date before posting",
    );
  }

  const jevNo = await nextJevNo(db, entry.barangayId, entry.book, period.year, period.month);
  const posted = { status: "posted" as const, jevNo, postedAt: new Date().toISOString(), postedBy: input.postedBy };

  // ---- Write. The status change and its audit row commit together or not at
  // all: a posted voucher with no trail is exactly what an auditor looks for.
  await db.writeBatch([
    statement(db.query.update(journalEntry).set(posted).where(eq(journalEntry.id, entry.id))),
    auditStatement(db, input.postedBy, "journal_entry.post", "journal_entry", entry.id, entry, {
      ...entry,
      ...posted,
    }),
  ]);

  return readEntry(db, entry.id);
}
