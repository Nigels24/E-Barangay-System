/**
 * Test-only database bootstrap.
 *
 * Creates a fresh in-memory SQLite database and applies the exact same
 * migrations that ship in ./drizzle (generated from schema.ts). This is
 * NOT the driver the real app uses — the app talks to SQLite through the
 * Tauri SQL plugin — but the schema and every constraint are identical,
 * so a test that passes here proves the same thing a test against the
 * real app database would.
 */
import Database from "better-sqlite3";
import { drizzle, type BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

export type TestDb = BetterSQLite3Database<typeof schema>;

export function createTestDb(): TestDb {
  const sqlite = new Database(":memory:");
  sqlite.pragma("foreign_keys = ON");
  const db = drizzle(sqlite, { schema });
  migrate(db, { migrationsFolder: "./drizzle" });
  return db;
}
