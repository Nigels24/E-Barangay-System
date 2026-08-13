/**
 * The real app's database adapter: SQLite on the office PC, reached through
 * Tauri (decision D30).
 *
 * Reads and writes both go through the two generic Rust commands in
 * `src-tauri/src/db_bridge.rs`, which borrow the pool `tauri-plugin-sql`
 * already owns. Nothing here knows any accounting — it is the same dumb
 * transport the test adapter is, so the engine code above it is identical in
 * both worlds.
 *
 * This file is never imported by the test suite: `invoke` only exists inside a
 * Tauri window. See IMPLEMENTATION_NOTES.md for how it gets smoke-tested.
 */
import { invoke } from "@tauri-apps/api/core";
import Database from "@tauri-apps/plugin-sql";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import * as schema from "./schema";
import type { BatchStatement, BatchStatementResult, EngineDb } from "./adapter";
import { WriteBatchError } from "./adapter";
import { assertForeignKeysEnabled, assertSchemaPresent } from "./guards";

/** The database file, resolved by the SQL plugin under the app's config dir. */
export const APP_DB_URL = "sqlite:ebarangay.db";

interface SelectResult {
  columns: string[];
  rows: unknown[][];
}

interface BridgeError {
  message: string;
  statementIndex: number | null;
}

function isBridgeError(value: unknown): value is BridgeError {
  return typeof value === "object" && value !== null && "message" in value;
}

export async function createAppDb(dbUrl: string = APP_DB_URL): Promise<EngineDb> {
  // Registers the pool under `dbUrl`; the Rust bridge looks it up by the same
  // string. One file, one pool, one owner. Migrations (registered in
  // src-tauri/src/lib.rs) run inside this call, before anything below can
  // issue a query — see that file for how idempotency across restarts works.
  await Database.load(dbUrl);

  const writeBatch = async (statements: BatchStatement[]): Promise<BatchStatementResult[]> => {
    try {
      return await invoke<BatchStatementResult[]>("db_execute_batch", { db: dbUrl, statements });
    } catch (cause) {
      if (isBridgeError(cause)) {
        throw new WriteBatchError(cause.message, cause.statementIndex ?? undefined);
      }
      throw new WriteBatchError(String(cause));
    }
  };

  const query = drizzleProxy<typeof schema>(
    async (sql, params, method) => {
      // A lone write still goes through the transactional path rather than the
      // read command, so there is exactly one way a write can reach the file.
      if (method === "run") {
        await writeBatch([{ sql, params }]);
        return { rows: [] };
      }
      const result = await invoke<SelectResult>("db_select", { db: dbUrl, sql, params });
      // `db_select` already returns positional rows, which is exactly what
      // Drizzle's proxy driver maps by index. `get` wants the row itself.
      return method === "get" ? { rows: result.rows[0] as unknown[] } : { rows: result.rows };
    },
    { schema },
  );

  const db: EngineDb = { query, writeBatch };

  // Database.load() creates an empty file when none exists, so an unmigrated
  // database is not a load failure — it opens fine and dies three layers down
  // on the first "no such table". These turn that into one clear error here,
  // before createAppDb() ever returns a handle to it.
  await assertSchemaPresent(db);
  await assertForeignKeysEnabled(db);

  return db;
}
