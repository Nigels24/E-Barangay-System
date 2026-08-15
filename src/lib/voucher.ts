/**
 * The voucher composer's rules, as pure functions.
 *
 * ### Why this file exists at all
 *
 * The screen it serves is the one place a bookkeeper puts real money into the
 * books, and there is no React testing library in this project — so anything
 * that stays inside the component is verified by eye and nothing else. What
 * lives here instead is every decision worth being wrong about: how typed
 * pesos become integer centavos, what the running totals say, and whether the
 * Post button may be enabled at all. All of it runs under vitest.
 *
 * ### Why the checks are duplicated from the engine
 *
 * `postEntry` already refuses an unbalanced voucher, a one-line voucher, a
 * zero-amount voucher and a `CkDJ` with no check details, and the database
 * refuses them again underneath that. Nothing here replaces those — the engine
 * remains the only gate that decides what is real. These checks exist so the
 * bookkeeper never *reaches* a refusal the form could have shown them coming:
 * the difference between "the button is off and says why" and "the button
 * looked fine and the app then rejected my work" is the whole usability of the
 * screen. If the two ever disagree, the engine is right and this is a bug.
 */
import type { JournalBook } from "../db/schema";
import type { DraftLineInput } from "./engine/post";
import { isWithinPeriod, formatPeriodLabel } from "./calendar";
import { formatPeso, sumCentavos, toCentavos } from "./money";

export type VoucherSide = "debit" | "credit";

/** One line of the composer, holding exactly what the DOM controls hold: strings. */
export interface VoucherLineForm {
  /** Stable identity for React keys and for "line 2" in a message. Never persisted. */
  key: string;
  /** `""` until an account is chosen. */
  accountId: string;
  side: VoucherSide;
  /** Pesos, exactly as typed. Converted to centavos at the one boundary below. */
  amount: string;
}

/** The header fields of the composer. Strings for the same reason. */
export interface VoucherHeaderForm {
  entryDate: string;
  book: JournalBook;
  particulars: string;
  checkNo: string;
  checkDate: string;
}

/** The period the voucher is being written into. */
export interface VoucherPeriod {
  year: number;
  month: number;
}

/**
 * A parsed amount field. `centavos` is null when the field is empty (not yet
 * filled in) or unparseable (`message` says why) — the two are distinguished
 * because an empty field is a normal state and a bad one is a mistake.
 */
export interface ParsedAmount {
  centavos: number | null;
  empty: boolean;
  message: string | null;
}

/**
 * Turns a typed peso string into integer centavos.
 *
 * `toCentavos` is the only conversion used, and it is string-based on purpose
 * (see `money.ts`: `15931.28 * 100` is `1593127.9999999998` in JavaScript).
 * This wrapper exists only to turn its throw into something a form can render
 * next to the field, and to reject at-or-below zero — a line carries exactly
 * one side, so a negative would have to be expressed by flipping debit and
 * credit, and the database's `line_exactly_one_side` CHECK refuses it anyway.
 */
export function parseAmount(text: string): ParsedAmount {
  const trimmed = text.trim();
  if (trimmed === "") return { centavos: null, empty: true, message: null };

  let centavos: number;
  try {
    centavos = toCentavos(trimmed);
  } catch {
    return { centavos: null, empty: false, message: `"${trimmed}" is not an amount.` };
  }

  if (centavos <= 0) {
    return { centavos: null, empty: false, message: "An amount must be more than zero." };
  }
  return { centavos, empty: false, message: null };
}

export interface VoucherTotals {
  debitCentavos: number;
  creditCentavos: number;
  /** Debits minus credits. Zero — and only zero — is a postable voucher. */
  differenceCentavos: number;
  balanced: boolean;
}

/**
 * The running totals, computed from whatever is currently typed.
 *
 * Lines that are blank or unparseable simply do not contribute, so the figures
 * stay meaningful while the bookkeeper is still filling the voucher in rather
 * than collapsing to zero on the first empty field.
 */
export function voucherTotals(lines: readonly VoucherLineForm[]): VoucherTotals {
  const amounts = lines.map((line) => ({ side: line.side, ...parseAmount(line.amount) }));
  const sideTotal = (side: VoucherSide) =>
    sumCentavos(
      amounts.filter((a) => a.side === side && a.centavos !== null).map((a) => a.centavos as number),
    );

  const debitCentavos = sideTotal("debit");
  const creditCentavos = sideTotal("credit");
  const differenceCentavos = debitCentavos - creditCentavos;
  return {
    debitCentavos,
    creditCentavos,
    differenceCentavos,
    balanced: differenceCentavos === 0 && debitCentavos > 0,
  };
}

/** A blank line, ready to type into. Debit by default — the left column comes first. */
export function emptyLine(key: string): VoucherLineForm {
  return { key, accountId: "", side: "debit", amount: "" };
}

/** A blank voucher for a period: dated inside it, a General Journal entry, no lines filled. */
export function emptyHeader(entryDate: string): VoucherHeaderForm {
  return { entryDate, book: "GJ", particulars: "", checkNo: "", checkDate: "" };
}

/** Check details are required on, and only on, a Check Disbursement (D16). */
export function needsCheckDetails(book: JournalBook): boolean {
  return book === "CkDJ";
}

/**
 * Everything standing between this voucher and being posted, in the order a
 * person would fix them. An empty list means Post may be enabled.
 *
 * Each entry is a whole sentence addressed to the bookkeeper — these are read
 * by someone who wants to know what to do next, not by a developer.
 */
export function voucherProblems(
  header: VoucherHeaderForm,
  lines: readonly VoucherLineForm[],
  period: VoucherPeriod,
): string[] {
  const problems: string[] = [];
  const periodLabel = formatPeriodLabel(period.year, period.month);

  if (header.particulars.trim() === "") {
    problems.push("Write what this voucher is for in Particulars.");
  }

  if (header.entryDate.trim() === "") {
    problems.push("Give the voucher a date.");
  } else if (!isWithinPeriod(header.entryDate, period.year, period.month)) {
    problems.push(`The date must fall inside ${periodLabel}, the period being worked on.`);
  }

  if (needsCheckDetails(header.book)) {
    if (header.checkNo.trim() === "") {
      problems.push("A check disbursement needs the check number.");
    }
    if (header.checkDate.trim() === "") {
      problems.push("A check disbursement needs the check date.");
    }
  }

  if (lines.length < 2) {
    problems.push("A voucher needs at least two lines — what is debited and what is credited.");
  }

  lines.forEach((line, index) => {
    const where = `Line ${index + 1}`;
    if (line.accountId.trim() === "") problems.push(`${where}: choose an account.`);

    const amount = parseAmount(line.amount);
    if (amount.empty) problems.push(`${where}: enter an amount.`);
    else if (amount.message) problems.push(`${where}: ${amount.message}`);
  });

  const totals = voucherTotals(lines);
  if (totals.differenceCentavos !== 0) {
    problems.push(
      `Debits and credits differ by ${formatPeso(Math.abs(totals.differenceCentavos))}. ` +
        "A voucher can only be posted when they match exactly.",
    );
  } else if (totals.debitCentavos === 0) {
    // Only reachable once every line is present and readable, so it is not
    // competing with "enter an amount" above.
    problems.push("A voucher cannot be posted for zero.");
  }

  return problems;
}

/** Whether Post may be pressed. The button's disabled state is exactly this. */
export function canPost(
  header: VoucherHeaderForm,
  lines: readonly VoucherLineForm[],
  period: VoucherPeriod,
): boolean {
  return voucherProblems(header, lines, period).length === 0;
}

/**
 * Converts the form's lines into the engine's input.
 *
 * Throws rather than skipping a bad line: a voucher that silently posts
 * without one of its lines is a corrupted voucher, which is far worse than a
 * refusal. Callers check {@link voucherProblems} first, so reaching the throw
 * means the two disagreed and the safe thing is to stop.
 */
export function toDraftLines(lines: readonly VoucherLineForm[]): DraftLineInput[] {
  return lines.map((line, index) => {
    const accountId = Number(line.accountId);
    if (!Number.isInteger(accountId) || accountId <= 0) {
      throw new Error(`Line ${index + 1} has no account chosen.`);
    }
    const { centavos } = parseAmount(line.amount);
    if (centavos === null) {
      throw new Error(`Line ${index + 1} has no usable amount.`);
    }
    return { accountId, side: line.side, amountCentavos: centavos };
  });
}
