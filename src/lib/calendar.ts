/**
 * The year and month lists the period picker offers, and how a period is
 * written out for a human.
 *
 * Pure functions with no database behind them, which is deliberate: years are
 * **not** seeded reference data. `schema.ts` on `accountingPeriod` and
 * `engine/period.ts` both say why — the client traces their Schedule of
 * Advances back to the year 2000 and opens years ahead of the calendar year, so
 * a period exists because someone opened it, never because a row was seeded in
 * advance. There is therefore nothing to query here; the picker just needs a
 * sensible range to offer, and `ensurePeriod` creates whatever is chosen.
 *
 * Month names are a hardcoded English list rather than `Intl.DateTimeFormat`.
 * The prototype's list is English, the client's own vouchers and reports are
 * written in English, and the office PC's locale is not something this app
 * should let decide what a report header says.
 */

/**
 * The oldest year the picker offers. The client's Schedule of Advances runs
 * back to 2000 (see `schema.ts` on `accountingPeriod`), which is the earliest
 * real record anyone has mentioned needing to reach.
 *
 * This is a convenience limit on the *dropdown*, not a rule about the database:
 * `accounting_period`'s own CHECK allows 1900–2200, and nothing here narrows
 * that. If the client ever produces a 1998 ledger, this constant moves; no
 * schema or migration is involved.
 */
export const EARLIEST_SELECTABLE_YEAR = 2000;

/** How far past the current calendar year the picker lets someone work. */
export const YEARS_AHEAD = 1;

export interface MonthOption {
  /** 1–12, matching `accounting_period.month`. */
  value: number;
  label: string;
}

export const MONTHS: readonly MonthOption[] = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
];

/**
 * Years offered by the picker, newest first — next year down to
 * {@link EARLIEST_SELECTABLE_YEAR}.
 *
 * Newest first because the overwhelmingly common case is the current or
 * previous month; back-entering 2003 is the rare one and can afford a scroll.
 * `today` is a parameter so this is testable without freezing the clock.
 */
export function selectableYears(today: Date = new Date()): number[] {
  const latest = today.getFullYear() + YEARS_AHEAD;
  const years: number[] = [];
  for (let year = latest; year >= EARLIEST_SELECTABLE_YEAR; year--) years.push(year);
  return years;
}

/** "December" for 12. Throws rather than returning `undefined` for a month outside 1–12. */
export function monthLabel(month: number): string {
  const found = MONTHS.find((m) => m.value === month);
  if (!found) throw new RangeError(`Month ${month} is not between 1 and 12`);
  return found.label;
}

/** "December 2023" — how a period is titled on screen and on a report header. */
export function formatPeriodLabel(year: number, month: number): string {
  return `${monthLabel(month)} ${year}`;
}
