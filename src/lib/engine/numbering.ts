/**
 * Voucher numbering, per docs/decisions.md D13-D15.
 *
 * Format is YYYY-MM-NNN, matching the client's own most consistent pattern
 * (their other two headers, "22-01-001" and "18-03-003", read as stale
 * template text rather than a live scheme). The sequence is scoped per
 * barangay + book + month (D14) — with 54 barangays sharing one database, an
 * unscoped sequence would collide immediately.
 */
import { and, eq, like } from "drizzle-orm";
import { journalEntry, type JournalBook } from "../../db/schema";
import type { EngineDb } from "./types";

/**
 * Returns the next voucher number in scope. Takes the MAX existing suffix
 * rather than a COUNT, because a back-entered historical voucher may carry
 * a manually-typed number from the paper document (D15) — the next
 * auto-generated number must jump past that, not collide with it.
 */
export async function nextJevNo(
  db: EngineDb,
  barangayId: number,
  book: JournalBook,
  year: number,
  month: number,
): Promise<string> {
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  const rows = await db.query
    .select({ jevNo: journalEntry.jevNo })
    .from(journalEntry)
    .where(
      and(
        eq(journalEntry.barangayId, barangayId),
        eq(journalEntry.book, book),
        like(journalEntry.jevNo, `${prefix}%`),
      ),
    )
    .all();

  let maxSuffix = 0;
  for (const row of rows) {
    if (!row.jevNo) continue;
    const suffix = Number(row.jevNo.slice(prefix.length));
    if (Number.isFinite(suffix) && suffix > maxSuffix) maxSuffix = suffix;
  }
  return `${prefix}${String(maxSuffix + 1).padStart(3, "0")}`;
}
