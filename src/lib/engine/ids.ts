/**
 * Row-id allocation for rows that other rows in the same write batch must
 * reference.
 *
 * ### Why this exists
 *
 * The engine used to read an inserted row back mid-transaction with
 * `.returning().get()` — a journal entry's id, which its lines then point at.
 * A batched all-or-nothing write (D30) has no mid-batch round trip: the whole
 * statement list is built, then handed over, then executed. So the id has to
 * be known before the batch is built.
 *
 * Three options were considered:
 *
 *   1. `last_insert_rowid()` inside the batch SQL. Rejected: it is only
 *      meaningful immediately after the insert it refers to, and a multi-row
 *      line insert moves it out from under itself.
 *   2. A batch protocol where a later statement can reference an earlier
 *      statement's insert id. Rejected: the substitution would have to be
 *      implemented twice — once in Rust for the app, once in TypeScript for
 *      the tests — and only the TypeScript copy would ever be under test. Two
 *      implementations of the same rule is exactly the drift the adapter seam
 *      exists to prevent.
 *   3. Allocating the id here, in TypeScript, before the batch is built.
 *      Chosen: one implementation, covered by the whole suite, and both
 *      adapters stay dumb executors of a literal statement list.
 *
 * The read happens just before the write, which is the time-of-check /
 * time-of-use gap D30 accepts explicitly: one office PC, one user, no
 * concurrent writers, and the primary key's UNIQUE constraint refuses a
 * collision at the database level if that assumption ever breaks.
 */
import { sql } from "drizzle-orm";
import type { EngineDb } from "./types";

/**
 * Returns the id SQLite itself would assign to the next row of `table`.
 *
 * Reads `sqlite_sequence`, the high-water mark an `AUTOINCREMENT` column
 * maintains — not `MAX(id) + 1`, which would hand back the id of a deleted
 * draft and quietly point old audit-log rows at a different record.
 */
export async function nextRowId(db: EngineDb, table: string): Promise<number> {
  // A raw query has no Drizzle field mapping, so the proxy driver hands back
  // the row as a positional array.
  const row = (await db.query.get(
    sql`select coalesce((select seq from sqlite_sequence where name = ${table}), 0) + 1`,
  )) as unknown[] | undefined;

  const next = Number(row?.[0]);
  if (!Number.isInteger(next) || next < 1) {
    throw new Error(`Could not allocate the next id for ${table}`);
  }
  return next;
}
