/**
 * Tests for the startup guards.
 *
 * These are the part of T-004's bootstrap that vitest can genuinely reach:
 * the guards take an `EngineDb`, so they can be pointed at the test adapter
 * and at a deliberately broken database. The Tauri side of bootstrap
 * (migrations running in Rust, seeding through the real bridge) is verified by
 * hand — see IMPLEMENTATION_NOTES.md.
 */
import { describe, it, expect } from "vitest";
import { createTestDb, type TestDb } from "../testDb";
import {
  assertForeignKeysEnabled,
  assertSchemaPresent,
  ForeignKeysDisabledError,
  REQUIRED_TABLES,
  REQUIRED_TRIGGERS,
  SchemaMissingError,
} from "../guards";

/** Drops every table and trigger, leaving exactly what `Database.load()` creates on a fresh machine: an empty file. */
function emptyOut(db: TestDb) {
  for (const trigger of REQUIRED_TRIGGERS) db.sqlite.exec(`DROP TRIGGER ${trigger}`);
  for (const table of REQUIRED_TABLES) db.sqlite.exec(`DROP TABLE ${table}`);
}

describe("assertSchemaPresent", () => {
  it("passes on a database with all four migrations applied", async () => {
    await expect(assertSchemaPresent(createTestDb())).resolves.toBeUndefined();
  });

  it("knows about all 13 tables and all 4 append-only triggers", () => {
    expect(REQUIRED_TABLES).toHaveLength(13);
    expect(REQUIRED_TRIGGERS).toHaveLength(4);
  });

  it("throws an actionable error on an empty database", async () => {
    const db = createTestDb();
    emptyOut(db);

    const error = await assertSchemaPresent(db).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SchemaMissingError);
    // Every missing object is named, so whoever reads the log knows the
    // migrations did not apply at all rather than partially.
    expect((error as SchemaMissingError).missing).toHaveLength(
      REQUIRED_TABLES.length + REQUIRED_TRIGGERS.length,
    );
    expect((error as SchemaMissingError).message).toContain("journal_entry");
    expect((error as SchemaMissingError).message).toContain("drizzle/");
  });

  it("throws when the tables exist but the append-only triggers do not", async () => {
    // The quiet failure this guard exists for: migration 0000 applied and 0001
    // did not, so the app looks completely healthy while nothing at the
    // database level stops a posted entry being deleted.
    const db = createTestDb();
    for (const trigger of REQUIRED_TRIGGERS) db.sqlite.exec(`DROP TRIGGER ${trigger}`);

    const error = await assertSchemaPresent(db).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SchemaMissingError);
    expect((error as SchemaMissingError).missing).toEqual([...REQUIRED_TRIGGERS]);
  });

  it("throws when a single table is missing", async () => {
    const db = createTestDb();
    db.sqlite.exec("DROP TABLE signatory");

    const error = await assertSchemaPresent(db).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(SchemaMissingError);
    expect((error as SchemaMissingError).missing).toEqual(["signatory"]);
  });
});

describe("assertForeignKeysEnabled", () => {
  it("passes on a database that enforces foreign keys", async () => {
    await expect(assertForeignKeysEnabled(createTestDb())).resolves.toBeUndefined();
  });

  it("throws when foreign key enforcement is off", async () => {
    const db = createTestDb();
    db.sqlite.pragma("foreign_keys = OFF");

    await expect(assertForeignKeysEnabled(db)).rejects.toThrow(ForeignKeysDisabledError);
  });
});
