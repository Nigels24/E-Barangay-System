/**
 * Barangay seed data — all 54 Pagadian City barangays, sourced from PSGC
 * (the Philippine Standard Geographic Code), not typed in from memory.
 *
 * Per docs/decisions.md D29: this list was produced by running
 * `npm run sync:barangays` once (2026-08-12) against
 * https://psgc.cloud/api/cities-municipalities/0907322000/barangays — the
 * ONE real network call this project ever makes — and reviewing the
 * output by hand before pasting it here. The shipped app never calls that
 * API itself; it reads only from this file and the local database, which
 * is what keeps it running with zero internet dependency on the office PC.
 *
 * Two real defects were found and corrected during that review, both
 * confirmed with a direct `curl` + JSON parse (bypassing any tool that
 * summarizes rather than passes through raw bytes):
 *   - 8 names had stray leading/trailing whitespace in the source data
 *     (e.g. "Balangasan " instead of "Balangasan") — trimmed.
 *   - "Santo Niño" came back as "Santo NiÃ±o" — classic UTF-8-read-as-
 *     Latin-1 mojibake in psgc.cloud's own stored data — decoded correctly.
 * Neither is a judgment call; both are mechanical, verifiable fixes to a
 * third-party mirror's data-entry issues, not a guess at what a name
 * should be.
 *
 * `isNameConfirmed` is true ONLY for Barangay Upper Sibatang, because that
 * name is independently verified against the client's real 2023 workbooks
 * — not just against PSGC. The other 53 are real, PSGC-confirmed
 * barangays of Pagadian City, but their exact preferred spelling/usage on
 * the City Accounting Office's own documents has not yet been confirmed
 * by the client. See docs/decisions.md D29 for what that review should
 * check before any of them appear on a printed government report.
 *
 * For the record: the original prototype listed five illustrative
 * barangay names ("Barangay Upper Sibatang", "Barangay Poblacion",
 * "Barangay San Isidro", "Barangay Santo Niño", "Barangay Bagong
 * Silang") as UI mockup filler. Cross-checking against the real PSGC
 * list confirms "Poblacion", "San Isidro", and "Bagong Silang" do not
 * exist in Pagadian City at all — they were never real. "Santo Niño"
 * happens to be a real barangay, confirmed here by coincidence, not
 * because the prototype's list was trustworthy.
 */
import { barangay } from "../schema";
import type { EngineDb } from "../../lib/engine/types";

export interface SeedBarangay {
  code: string;
  name: string;
  isNameConfirmed?: boolean;
}

export const SEED_BARANGAYS: readonly SeedBarangay[] = [
  { code: "0907322001", name: "Barangay Alegria" },
  { code: "0907322002", name: "Barangay Balangasan" },
  { code: "0907322003", name: "Barangay Balintawak" },
  { code: "0907322004", name: "Barangay Baloyboan" },
  { code: "0907322005", name: "Barangay Banale" },
  { code: "0907322006", name: "Barangay Bogo" },
  { code: "0907322007", name: "Barangay Bomba" },
  { code: "0907322010", name: "Barangay Buenavista" },
  { code: "0907322011", name: "Barangay Bulatok" },
  { code: "0907322012", name: "Barangay Bulawan" },
  { code: "0907322013", name: "Barangay Danlugan" },
  { code: "0907322014", name: "Barangay Dao" },
  { code: "0907322015", name: "Barangay Datagan" },
  { code: "0907322016", name: "Barangay Deborok" },
  { code: "0907322017", name: "Barangay Ditoray" },
  { code: "0907322018", name: "Barangay Gatas" },
  { code: "0907322019", name: "Barangay Gubac" },
  { code: "0907322020", name: "Barangay Gubang" },
  { code: "0907322021", name: "Barangay Kagawasan" },
  { code: "0907322022", name: "Barangay Kahayagan" },
  { code: "0907322023", name: "Barangay Kalasan" },
  { code: "0907322024", name: "Barangay La Suerte" },
  { code: "0907322025", name: "Barangay Lala" },
  { code: "0907322026", name: "Barangay Lapidian" },
  { code: "0907322027", name: "Barangay Lenienza" },
  { code: "0907322028", name: "Barangay Lizon Valley" },
  { code: "0907322029", name: "Barangay Lourdes" },
  { code: "0907322030", name: "Barangay Lower Sibatang" },
  { code: "0907322031", name: "Barangay Lumad" },
  { code: "0907322032", name: "Barangay Macasing" },
  { code: "0907322033", name: "Barangay Manga" },
  { code: "0907322034", name: "Barangay Muricay" },
  { code: "0907322035", name: "Barangay Napolan" },
  { code: "0907322036", name: "Barangay Palpalan" },
  { code: "0907322037", name: "Barangay Pedulonan" },
  { code: "0907322038", name: "Barangay Poloyagan" },
  { code: "0907322039", name: "Barangay San Francisco" },
  { code: "0907322040", name: "Barangay San Jose" },
  { code: "0907322041", name: "Barangay San Pedro" },
  { code: "0907322042", name: "Barangay Santa Lucia" },
  { code: "0907322043", name: "Barangay Santiago" },
  { code: "0907322044", name: "Barangay Tawagan Sur" },
  { code: "0907322045", name: "Barangay Tiguma" },
  { code: "0907322046", name: "Barangay Tuburan" },
  { code: "0907322047", name: "Barangay Tulawas" },
  { code: "0907322048", name: "Barangay Tulangan" },
  { code: "0907322050", name: "Barangay Upper Sibatang", isNameConfirmed: true },
  { code: "0907322051", name: "Barangay White Beach" },
  { code: "0907322052", name: "Barangay Kawit" },
  { code: "0907322053", name: "Barangay Lumbia" },
  { code: "0907322054", name: "Barangay Santa Maria" },
  { code: "0907322055", name: "Barangay Santo Niño" },
  { code: "0907322056", name: "Barangay Dampalan" },
  { code: "0907322057", name: "Barangay Dumagoc" },
] as const;

/**
 * Names known NOT to be real Pagadian City barangays — the prototype's
 * unverified mockup filler, kept here only so a test can assert they
 * never silently reappear in SEED_BARANGAYS.
 */
export const KNOWN_FICTIONAL_BARANGAY_NAMES = [
  "Barangay Poblacion",
  "Barangay San Isidro",
  "Barangay Bagong Silang",
] as const;

/**
 * Inserts every seed barangay not already present (matched by code).
 * Accepts an optional additional list for barangays outside Pagadian City
 * or any future correction, without needing to edit this file.
 */
export function seedBarangays(db: EngineDb, extra: readonly SeedBarangay[] = []) {
  const existingCodes = new Set(
    db.select({ code: barangay.code }).from(barangay).all().map((r) => r.code),
  );
  const toInsert = [...SEED_BARANGAYS, ...extra].filter((b) => !existingCodes.has(b.code));
  if (toInsert.length === 0) return [];

  return db
    .insert(barangay)
    .values(toInsert.map((b) => ({ code: b.code, name: b.name, isNameConfirmed: b.isNameConfirmed ?? false })))
    .returning()
    .all();
}
