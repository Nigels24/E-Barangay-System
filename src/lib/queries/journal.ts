/**
 * Reading a period's journal, and writing a voucher into it.
 *
 * The engine (`src/lib/engine/post.ts`) owns what a voucher *is* and every
 * rule about posting one. This module is the seam between a screen and that
 * engine: it reads back what a period contains in the shape a table renders,
 * and it runs the two-step create-then-post sequence in one place where it can
 * be tested, instead of inside a component where it could not be.
 */
import { asc, eq } from "drizzle-orm";
import {
  account,
  journalEntry,
  journalEntryLine,
  type JournalBook,
  type JournalEntryStatus,
} from "../../db/schema";
import { createDraftEntry, postEntry, type DraftLineInput } from "../engine/post";
import { voidEntry } from "../engine/void";
import type { EngineDb } from "../engine/types";
import { sumCentavos } from "../money";
import { requirePostingUserId } from "./users";

/** One posted or drafted line, joined to the account it hits. */
export interface VoucherLine {
  lineNo: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  debitCentavos: number;
  creditCentavos: number;
}

/** A voucher as the period table shows it: its header, its lines, its totals. */
export interface PeriodVoucher {
  entryId: number;
  /** Null while the voucher is still a draft — it gets its number on posting (D13). */
  jevNo: string | null;
  entryDate: string;
  book: JournalBook;
  particulars: string;
  status: JournalEntryStatus;
  checkNo: string | null;
  lines: VoucherLine[];
  totalDebitCentavos: number;
  totalCreditCentavos: number;
}

/** The flat join row, before it is grouped. Exported for the grouping test. */
export interface PeriodLineRow {
  entryId: number;
  jevNo: string | null;
  entryDate: string;
  book: JournalBook;
  particulars: string;
  status: JournalEntryStatus;
  checkNo: string | null;
  lineNo: number;
  accountId: number;
  accountCode: string;
  accountName: string;
  debitCentavos: number;
  creditCentavos: number;
}

/**
 * Folds the flat join into one entry per voucher.
 *
 * Pure and separately exported because it is where an off-by-one in the
 * grouping would hide, and because the row order it relies on is the order the
 * query below asks for — the two are tested together and separately.
 */
export function groupLinesIntoVouchers(rows: readonly PeriodLineRow[]): PeriodVoucher[] {
  const vouchers: PeriodVoucher[] = [];
  const byId = new Map<number, PeriodVoucher>();

  for (const row of rows) {
    let voucher = byId.get(row.entryId);
    if (!voucher) {
      voucher = {
        entryId: row.entryId,
        jevNo: row.jevNo,
        entryDate: row.entryDate,
        book: row.book,
        particulars: row.particulars,
        status: row.status,
        checkNo: row.checkNo,
        lines: [],
        totalDebitCentavos: 0,
        totalCreditCentavos: 0,
      };
      byId.set(row.entryId, voucher);
      vouchers.push(voucher);
    }
    voucher.lines.push({
      lineNo: row.lineNo,
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      debitCentavos: row.debitCentavos,
      creditCentavos: row.creditCentavos,
    });
  }

  for (const voucher of vouchers) {
    voucher.totalDebitCentavos = sumCentavos(voucher.lines.map((l) => l.debitCentavos));
    voucher.totalCreditCentavos = sumCentavos(voucher.lines.map((l) => l.creditCentavos));
  }
  return vouchers;
}

/**
 * Every voucher filed under a period — drafts, posted and voided alike —
 * oldest first, each with its lines in line order.
 *
 * **Drafts are included deliberately.** A voucher is created and then posted in
 * two separate write batches (D30 forbids one interactive transaction across
 * them), so a failure in between leaves a draft with no number. That is
 * tolerable only because it is *visible*: a bookkeeper can see the half-made
 * voucher sitting there rather than wondering whether their work vanished.
 *
 * The join is an inner join on lines, which is safe because a voucher and its
 * lines are written in a single all-or-nothing batch — a header can never exist
 * without them.
 */
export async function listPeriodVouchers(db: EngineDb, periodId: number): Promise<PeriodVoucher[]> {
  const rows = await db.query
    .select({
      entryId: journalEntry.id,
      jevNo: journalEntry.jevNo,
      entryDate: journalEntry.entryDate,
      book: journalEntry.book,
      particulars: journalEntry.particulars,
      status: journalEntry.status,
      checkNo: journalEntry.checkNo,
      lineNo: journalEntryLine.lineNo,
      accountId: journalEntryLine.accountId,
      accountCode: account.code,
      accountName: account.name,
      debitCentavos: journalEntryLine.debitCentavos,
      creditCentavos: journalEntryLine.creditCentavos,
    })
    .from(journalEntryLine)
    .innerJoin(journalEntry, eq(journalEntryLine.entryId, journalEntry.id))
    .innerJoin(account, eq(journalEntryLine.accountId, account.id))
    .where(eq(journalEntry.periodId, periodId))
    .orderBy(asc(journalEntry.entryDate), asc(journalEntry.id), asc(journalEntryLine.lineNo))
    .all();

  return groupLinesIntoVouchers(rows);
}

/** What the stat cards above the table show. */
export interface PeriodTotals {
  /** Posted only — a draft has not entered the books and must not be counted as if it had. */
  postedDebitCentavos: number;
  postedCreditCentavos: number;
  postedCount: number;
  draftCount: number;
  voidedCount: number;
}

/**
 * Totals for a period's stat cards, computed from the lines themselves.
 *
 * Only posted vouchers contribute to the money figures. A draft is not in the
 * books — showing its amount in a "total debits" card would tell a bookkeeper
 * the books hold money they do not. Voided vouchers are excluded for the same
 * reason: their effect is cancelled by a reversing entry, which is itself a
 * posted voucher and is already counted.
 */
export function summarisePeriod(vouchers: readonly PeriodVoucher[]): PeriodTotals {
  const posted = vouchers.filter((v) => v.status === "posted");
  return {
    postedDebitCentavos: sumCentavos(posted.map((v) => v.totalDebitCentavos)),
    postedCreditCentavos: sumCentavos(posted.map((v) => v.totalCreditCentavos)),
    postedCount: posted.length,
    draftCount: vouchers.filter((v) => v.status === "draft").length,
    voidedCount: vouchers.filter((v) => v.status === "voided").length,
  };
}

export interface NewVoucherInput {
  barangayId: number;
  periodId: number;
  entryDate: string;
  book: JournalBook;
  particulars: string;
  /** Required on a CkDJ (D16); the engine refuses to post one without them. */
  checkNo?: string;
  checkDate?: string;
  lines: DraftLineInput[];
}

/**
 * Thrown when the draft was written but posting it failed.
 *
 * This is the honest shape of a two-batch sequence: the draft is real and on
 * disk, so the message a screen shows has to say so rather than implying
 * nothing happened. `draftEntryId` is the voucher now sitting in the period
 * table as a draft.
 */
export class VoucherNotPostedError extends Error {
  readonly draftEntryId: number;

  constructor(draftEntryId: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "VoucherNotPostedError";
    this.draftEntryId = draftEntryId;
  }
}

/** A voucher that made it all the way into the books. */
export interface PostedVoucher {
  entryId: number;
  jevNo: string;
}

/**
 * Creates a voucher and posts it, as one call from the screen's point of view.
 *
 * It is two write batches underneath, and cannot be fewer: `createDraftEntry`
 * has to commit before `postEntry` can read the lines back and check that they
 * balance, and D30 rules out holding one interactive transaction open across
 * both. So the gap is real — a failure between them leaves a draft. Rather
 * than hide that, the draft is left in place, `listPeriodVouchers` shows it,
 * and {@link VoucherNotPostedError} names it.
 *
 * The user is resolved here rather than passed in, so that no screen can
 * attribute an entry to the wrong actor by accident — there is exactly one
 * answer today (D32) and exactly one place that decides it.
 */
export async function postNewVoucher(
  db: EngineDb,
  input: NewVoucherInput,
): Promise<PostedVoucher> {
  const userId = await requirePostingUserId(db);

  const draft = await createDraftEntry(db, {
    barangayId: input.barangayId,
    periodId: input.periodId,
    entryDate: input.entryDate,
    book: input.book,
    particulars: input.particulars.trim(),
    // Empty strings would satisfy the NOT NULL-free columns while failing the
    // `ckdj_requires_check_details` intent; store nothing instead of blanks.
    checkNo: input.checkNo?.trim() || undefined,
    checkDate: input.checkDate?.trim() || undefined,
    lines: input.lines,
    createdBy: userId,
  });

  let posted;
  try {
    posted = await postEntry(db, { entryId: draft.id, postedBy: userId });
  } catch (error: unknown) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new VoucherNotPostedError(
      draft.id,
      `${reason} The voucher has been kept as a draft and is listed below; nothing has entered the books.`,
      { cause: error },
    );
  }

  if (!posted.jevNo) {
    // postEntry assigns the number in the same batch as the status change, so
    // this cannot happen without the two having come apart.
    throw new VoucherNotPostedError(
      draft.id,
      "The voucher was posted but came back without a voucher number. Do not re-enter it — have the database checked first.",
    );
  }
  return { entryId: posted.id, jevNo: posted.jevNo };
}

export interface VoidVoucherInput {
  entryId: number;
  reason: string;
  /** The date the reversal itself is dated. */
  reversalDate: string;
  /** The period the reversal posts into — always the period on screen (see PLAN.md T-010 trap 2), never a picker. */
  periodId: number;
}

/**
 * Voids a posted voucher and posts its reversal, as one call from the
 * screen's point of view.
 *
 * The user is resolved here, not passed in, for the same reason
 * {@link postNewVoucher} resolves it — there is exactly one answer today
 * (D32) and exactly one place that decides it. Everything else — the
 * reversal's swapped lines, its own JEV number, the atomic batch — is
 * `voidEntry`'s job; this is the seam, not a second copy of the logic.
 */
export async function voidPostedVoucher(db: EngineDb, input: VoidVoucherInput) {
  const userId = await requirePostingUserId(db);
  return voidEntry(db, {
    entryId: input.entryId,
    reason: input.reason,
    voidedBy: userId,
    reversalDate: input.reversalDate,
    reversalPeriodId: input.periodId,
  });
}
