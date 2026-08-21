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

/**
 * The "YYYY-MM-" an ISO date must start with to belong to a period. This is
 * the exact rule `postEntry` enforces (`post.ts`), restated here so a form can
 * stop a date before it becomes a refusal.
 */
export function periodDatePrefix(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function daysInMonth(year: number, month: number): number {
  const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (month !== 2) return lengths[month - 1];
  const leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  return leap ? 29 : 28;
}

/**
 * First day of the period, "2023-12-01" — what a new voucher's date starts on
 * and the earliest date its picker allows.
 */
export function periodStartDate(year: number, month: number): string {
  monthLabel(month); // rejects a month outside 1-12 with the same message everywhere
  return `${periodDatePrefix(year, month)}-01`;
}

/** Last day of the period, "2023-12-31" — the latest date the picker allows. */
export function periodEndDate(year: number, month: number): string {
  monthLabel(month);
  return `${periodDatePrefix(year, month)}-${String(daysInMonth(year, month)).padStart(2, "0")}`;
}

/**
 * Whether an ISO date belongs to a period.
 *
 * Deliberately a prefix comparison rather than date arithmetic: that is
 * literally what `postEntry` checks, and a form that used a subtly different
 * rule would let through a date the engine then refuses.
 */
export function isWithinPeriod(isoDate: string, year: number, month: number): boolean {
  return isoDate.startsWith(`${periodDatePrefix(year, month)}-`);
}

/** "YYYY-MM-DD" in the local calendar day — never `toISOString()`, which is UTC and can name the wrong day near midnight. */
function toIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * A sane default for a date field clamped to a period: today, if today falls
 * inside it, otherwise the period's last day. Used for a reversal's date,
 * which is normally "today" but must never default outside the period it's
 * being posted into. `today` is a parameter for the same reason
 * {@link selectableYears} takes one — testable without freezing the clock.
 */
export function defaultDateInPeriod(year: number, month: number, today: Date = new Date()): string {
  const todayIso = toIsoDate(today);
  return isWithinPeriod(todayIso, year, month) ? todayIso : periodEndDate(year, month);
}

/**
 * "2023-12-31" -> "December 31, 2023" — a report's own `asOfDate`, spelled
 * out for its header. Parses the date the report actually computed rather
 * than re-deriving one from year/month, so the label on screen can never
 * name a different day than the figures under it were computed as of.
 */
export function formatIsoDateLong(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  return `${monthLabel(month)} ${day}, ${year}`;
}
