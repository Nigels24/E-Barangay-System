/**
 * Startup assertions about the database the app just opened.
 *
 * `Database.load()` **creates an empty file** when none exists, so the real
 * broken state on the office PC is not "no database" but "a database with no
 * tables" — and the first query dies three layers downstream on `no such
 * table`. These two checks turn that into one clear error at startup.
 *
 * Both take an `EngineDb`, so they run against either adapter and are covered
 * by the test suite even though `appDb.ts` itself is not reachable from vitest.
 *
 * Note both queries read through `db.query.values()`. Every row that comes back
 * across this seam is positional — `[value, …]`, not `{ name: … }` — because
 * that is what Drizzle's proxy driver expects and what both adapters return.
 */
import { getTableName, isTable, sql } from "drizzle-orm";
import type { EngineDb } from "./adapter";
import * as schema from "./schema";

/**
 * Every table in `src/db/schema.ts`, derived from the schema itself so a
 * fourteenth table cannot be added without this guard learning about it.
 */
export const REQUIRED_TABLES: readonly string[] = Object.values(schema)
  // schema.ts also exports enums, types and relations alongside its tables;
  // `isTable` is Drizzle's own check for which exports are real tables.
  .filter(isTable)
  .map((table) => getTableName(table))
  .sort();

/**
 * The append-only triggers from `0001_enforce_append_only.sql`.
 *
 * These are the database-level guarantee that a posted journal entry can never
 * be deleted. Tables without them is the quiet failure — the app would look
 * fine and the audit trail would not be enforced — so they are checked by name,
 * not inferred from the migration having not errored.
 */
export const REQUIRED_TRIGGERS = [
  "prevent_delete_audit_log",
  "prevent_delete_posted_journal_entry",
  "prevent_delete_posted_journal_entry_line",
  "prevent_update_audit_log",
] as const;

/** Thrown when the database is missing tables or triggers the app requires. */
export class SchemaMissingError extends Error {
  /** Names of the missing tables and triggers, tables first. */
  readonly missing: readonly string[];

  constructor(missing: readonly string[]) {
    super(
      `The database is missing ${missing.length} required object(s): ${missing.join(", ")}. ` +
        `The migrations in drizzle/ did not apply. Close the app, and either delete the ` +
        `database file so it is rebuilt from scratch, or restore it from a backup — do not ` +
        `create the missing tables by hand.`,
    );
    this.name = "SchemaMissingError";
    this.missing = missing;
  }
}

/** Thrown when SQLite would not enforce foreign keys on this connection. */
export class ForeignKeysDisabledError extends Error {
  constructor() {
    super(
      "SQLite reports foreign_keys = OFF on this connection, so the database would accept " +
        "journal lines pointing at accounts that do not exist. Refusing to open the books.",
    );
    this.name = "ForeignKeysDisabledError";
  }
}

/**
 * Asserts that every table and append-only trigger the app needs exists.
 *
 * Reads `sqlite_master` — the database's own catalogue — rather than trusting
 * that the migration step reported success.
 */
export async function assertSchemaPresent(db: EngineDb): Promise<void> {
  const rows = await db.query.values<[string]>(
    sql`select name from sqlite_master where type in ('table', 'trigger')`,
  );
  const present = new Set(rows.map(([name]) => name));

  const missing = [
    ...REQUIRED_TABLES.filter((name) => !present.has(name)),
    ...REQUIRED_TRIGGERS.filter((name) => !present.has(name)),
  ];

  if (missing.length > 0) throw new SchemaMissingError(missing);
}

/**
 * Asserts SQLite is enforcing foreign keys.
 *
 * `testDb.ts` sets `foreign_keys = ON` explicitly; the app path inherits it
 * from sqlx's connect options, which set the same pragma on every connection it
 * opens. Both are on today, and this check exists so that if that default ever
 * changed, the app would say so on startup instead of quietly accepting
 * orphaned rows while every test stayed green.
 *
 * It asserts rather than sets: the app talks to a connection *pool*, and a
 * pragma issued on whichever connection served this query would not apply to
 * the others. Setting it for real belongs to whoever opens the connections,
 * which is sqlx.
 */
export async function assertForeignKeysEnabled(db: EngineDb): Promise<void> {
  const rows = await db.query.values<[number]>(sql`pragma foreign_keys`);
  if (rows[0]?.[0] !== 1) throw new ForeignKeysDisabledError();
}
