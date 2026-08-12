/**
 * Money handling for the whole app.
 *
 * The prototype stored money as JavaScript numbers (e.g. `2491080.10`) and
 * did arithmetic directly on them. That works for display but silently
 * drifts once you sum enough rows — IEEE-754 floats cannot represent most
 * centavo amounts exactly. A trial balance that's off by ₱0.03 is a failed
 * audit, so this app never does arithmetic on peso floats.
 *
 * The rule: money is an INTEGER number of centavos everywhere except the
 * two edges of the system — parsing a human-typed or spreadsheet value in,
 * and formatting a value out for display/print. `toCentavos` and
 * `formatPeso` are those two edges; everything in between (the ledger,
 * the reports, the engine) works only in centavos.
 */

const AMOUNT_PATTERN = /^-?\d{1,3}(,\d{3})*(\.\d+)?$|^-?\d+(\.\d+)?$/;

/**
 * Parses a peso amount — from a form field, an imported spreadsheet cell,
 * or a literal in code — into an exact integer number of centavos.
 *
 * Deliberately string-based rather than `Math.round(pesos * 100)`: that
 * multiplication is exactly the kind of float operation this module exists
 * to avoid (e.g. `15931.28 * 100` is `1593127.9999999998` in JS).
 *
 * Accepts numbers, plain decimal strings, and comma-grouped strings
 * ("2,491,080.10"). Throws on anything else — a bookkeeping app should
 * never silently coerce a bad amount to zero.
 */
export function toCentavos(pesos: number | string): number {
  const raw = typeof pesos === "number" ? pesos.toString() : pesos.trim();
  const unformatted = raw.replace(/,/g, "");

  if (raw === "" || !AMOUNT_PATTERN.test(unformatted) || !isFinite(Number(unformatted))) {
    throw new Error(`toCentavos: "${pesos}" is not a valid peso amount`);
  }

  const negative = unformatted.startsWith("-");
  const abs = negative ? unformatted.slice(1) : unformatted;
  const [wholePart, fractionPart = ""] = abs.split(".");
  // Round to the nearest centavo rather than truncate, so a third decimal
  // digit (e.g. from a spreadsheet formula) rounds the way a human would.
  const fractionDigits = (fractionPart + "000").slice(0, 3);
  const roundedFraction = Math.round(Number(fractionDigits) / 10);
  const carry = roundedFraction === 100 ? 1 : 0;
  const centavosPart = carry ? 0 : roundedFraction;

  const wholeCentavos = (BigInt(wholePart) + BigInt(carry)) * 100n + BigInt(centavosPart);
  const value = Number(wholeCentavos);
  return negative ? -value : value;
}

/**
 * Shared core of the two output formatters: validates the input and splits it
 * into a sign and a grouped `2,491,080.10` body. The only difference between
 * `formatPeso` and `formatPesoPlain` is whether the ₱ symbol is prepended, so
 * the integer/decimal split lives here once. `caller` is threaded through only
 * so the thrown message still names the function the caller actually used.
 */
function splitForDisplay(centavos: number, caller: string): { negative: boolean; body: string } {
  if (!Number.isInteger(centavos)) {
    throw new Error(`${caller}: ${centavos} is not an integer number of centavos`);
  }
  const negative = centavos < 0;
  const abs = Math.abs(centavos);
  const pesos = Math.floor(abs / 100);
  const cents = abs % 100;
  const formattedPesos = pesos.toLocaleString("en-PH");
  return { negative, body: `${formattedPesos}.${cents.toString().padStart(2, "0")}` };
}

/**
 * Formats an integer centavos amount as a peso string for display or
 * printing, e.g. `249108010 -> "₱2,491,080.10"`, `-50025 -> "-₱500.25"`.
 */
export function formatPeso(centavos: number): string {
  const { negative, body } = splitForDisplay(centavos, "formatPeso");
  const formatted = `₱${body}`;
  return negative ? `-${formatted}` : formatted;
}

/**
 * Same as `formatPeso` but without the ₱ symbol, e.g.
 * `249108010 -> "2,491,080.10"`, `-50025 -> "-500.25"`.
 *
 * For report columns: the client's own trial balance prints bare amounts and
 * states the currency once in the report header, rather than repeating the
 * sign on every row.
 */
export function formatPesoPlain(centavos: number): string {
  const { negative, body } = splitForDisplay(centavos, "formatPesoPlain");
  return negative ? `-${body}` : body;
}

/** Converts centavos back to a plain peso number, e.g. for a numeric input's `value`. Not for arithmetic. */
export function centavosToPesoNumber(centavos: number): number {
  return centavos / 100;
}

/** Sums a list of centavos amounts. Trivial, but keeps ledger code from doing `+` on raw arrays inline. */
export function sumCentavos(amounts: number[]): number {
  return amounts.reduce((total, amount) => total + amount, 0);
}
