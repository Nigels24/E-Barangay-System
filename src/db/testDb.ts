/**
 * Test-only database: an in-memory SQLite file with the exact migrations
 * that ship in ./drizzle.
 *
 * It is NOT the driver the real app uses — the app reaches SQLite through
 * Tauri — but it implements the same `EngineDb` seam and, importantly, drives
 * the same Drizzle *proxy* driver the app does. Both adapters therefore
 * generate identical SQL from identical query-builder code and map results
 * through identical Drizzle code; only the transport underneath differs. That
 * is what makes a test here evidence about the shipped app.
 */
import Database from "better-sqlite3";
import { drizzle as drizzleProxy } from "drizzle-orm/sqlite-proxy";
import { drizzle as drizzleSync } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";
import type { BatchStatement, BatchStatementResult, EngineDb } from "./adapter";
import { WriteBatchError } from "./adapter";

export interface TestDb extends EngineDb {
  /** The raw driver, for tests that need to assert on the file itself. */
  readonly sqlite: Database.Database;
}

export function createTestDb(): TestDb {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");

  // Migrations run through the synchronous driver — the migrator is the one
  // place a sync handle is genuinely simpler, and it runs before any engine
  // code exists to care.
  migrate(drizzleSync(sqlite, { schema }), { migrationsFolder: "./drizzle" });

  const query = drizzleProxy<typeof schema>(
    async (sql, params, method) => {
      const prepared = sqlite.prepare(sql);
      if (method === "run") {
        // A lone write goes straight to better-sqlite3 here, unlike appDb
        // (where every write, lone or batched, is routed through writeBatch).
        // Wrapping the failure in WriteBatchError keeps the error type the
        // same across both adapters for this one asymmetric path.
        try {
          prepared.run(params as unknown[]);
        } catch (cause) {
          throw new WriteBatchError(cause instanceof Error ? cause.message : String(cause));
        }
        return { rows: [] };
      }
      // Drizzle's proxy driver maps columns by POSITION, so rows must come
      // back as arrays of values, not name-keyed objects. `get` is stranger
      // still: it wants the single row itself as `rows`, and `undefined` when
      // there is none.
      const rows = prepared.raw().all(params as unknown[]) as unknown[][];
      return method === "get" ? { rows: rows[0] as unknown[] } : { rows };
    },
    { schema },
  );

  const writeBatch = async (statements: BatchStatement[]): Promise<BatchStatementResult[]> => {
    // better-sqlite3's `transaction()` is the local equivalent of the Rust
    // bridge's `pool.begin()`: one connection, commit on return, rollback on
    // throw. This is what the atomicity test actually exercises.
    const run = sqlite.transaction((batch: BatchStatement[]) => {
      const results: BatchStatementResult[] = [];
      batch.forEach((s, index) => {
        try {
          const info = sqlite.prepare(s.sql).run(s.params as unknown[]);
          results.push({
            rowsAffected: info.changes,
            lastInsertRowid: Number(info.lastInsertRowid),
          });
        } catch (cause) {
          throw new WriteBatchError(
            cause instanceof Error ? cause.message : String(cause),
            index,
          );
        }
      });
      return results;
    });
    return run(statements);
  };

  return { query, writeBatch, sqlite };
}
