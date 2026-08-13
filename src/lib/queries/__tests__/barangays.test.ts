import { describe, it, expect } from "vitest";
import { createTestDb } from "../../../db/testDb";
import { barangay } from "../../../db/schema";
import { runSeed } from "../../../db/seed";
import { listBarangays } from "../barangays";

describe("listBarangays", () => {
  it("returns all 54 seeded Pagadian barangays", async () => {
    const db = createTestDb();
    await runSeed(db);
    expect(await listBarangays(db)).toHaveLength(54);
  });

  it("orders by name, not by the PSGC order the seed inserts in", async () => {
    const db = createTestDb();
    await runSeed(db);
    const names = (await listBarangays(db)).map((b) => b.name);

    expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
    // Kawit (0907322052) is seeded well after White Beach (0907322051), so
    // insertion order and alphabetical order genuinely disagree here.
    expect(names.indexOf("Barangay Kawit")).toBeLessThan(names.indexOf("Barangay White Beach"));
    expect(names[0]).toBe("Barangay Alegria");
  });

  it("sorts the one accented name where a reader expects it", async () => {
    const db = createTestDb();
    await runSeed(db);
    const names = (await listBarangays(db)).map((b) => b.name);
    // SQLite's default collation is byte order, so this is worth pinning:
    // "Santo Niño" belongs after "Santiago", not off the end of the list.
    expect(names.indexOf("Barangay Santiago")).toBeLessThan(names.indexOf("Barangay Santo Niño"));
    expect(names.at(-1)).toBe("Barangay White Beach");
  });

  it("leaves out deactivated barangays", async () => {
    const db = createTestDb();
    const active = await db.query
      .insert(barangay)
      .values({ code: "TEST-A", name: "Barangay Active" })
      .returning()
      .get();
    await db.query
      .insert(barangay)
      .values({ code: "TEST-B", name: "Barangay Retired", isActive: false })
      .returning()
      .get();

    expect(await listBarangays(db)).toEqual([{ id: active.id, name: "Barangay Active" }]);
  });

  it("returns an empty list rather than throwing on an unseeded database", async () => {
    expect(await listBarangays(createTestDb())).toEqual([]);
  });
});
