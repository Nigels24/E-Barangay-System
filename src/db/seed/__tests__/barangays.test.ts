import { describe, it, expect } from "vitest";
import { createTestDb } from "../../testDb";
import { seedBarangays, SEED_BARANGAYS, KNOWN_FICTIONAL_BARANGAY_NAMES } from "../barangays";
import { barangay } from "../../schema";

describe("seedBarangays", () => {
  it("seeds all 54 real Pagadian City barangays, sourced from PSGC", () => {
    const db = createTestDb();
    seedBarangays(db);
    const rows = db.select().from(barangay).all();
    expect(rows).toHaveLength(54);
    expect(rows).toHaveLength(SEED_BARANGAYS.length);
  });

  it("marks only Barangay Upper Sibatang as name-confirmed — it alone is verified against real workbooks", () => {
    const db = createTestDb();
    seedBarangays(db);
    const rows = db.select().from(barangay).all();

    const confirmed = rows.filter((r) => r.isNameConfirmed);
    expect(confirmed).toHaveLength(1);
    expect(confirmed[0].name).toBe("Barangay Upper Sibatang");
    expect(confirmed[0].code).toBe("0907322050");
  });

  it("does NOT seed the prototype's three genuinely fictional barangay names", () => {
    const db = createTestDb();
    seedBarangays(db);
    const names = db.select().from(barangay).all().map((b) => b.name);
    for (const fictional of KNOWN_FICTIONAL_BARANGAY_NAMES) {
      expect(names).not.toContain(fictional);
    }
  });

  it("DOES seed Barangay Santo Niño — real per PSGC, coincidentally also in the old prototype's list", () => {
    const db = createTestDb();
    seedBarangays(db);
    const names = db.select().from(barangay).all().map((b) => b.name);
    expect(names).toContain("Barangay Santo Niño");
  });

  it("no name has the mojibake the source API returned for Santo Niño (\"NiÃ±o\") or any stray whitespace", () => {
    for (const b of SEED_BARANGAYS) {
      expect(b.name).not.toMatch(/Ã/);
      expect(b.name).toBe(b.name.trim());
    }
  });

  it("no two seed barangays share the same PSGC code", () => {
    const codes = SEED_BARANGAYS.map((b) => b.code);
    expect(new Set(codes).size).toBe(codes.length);
  });

  it("is idempotent — running it twice never duplicates", () => {
    const db = createTestDb();
    seedBarangays(db);
    seedBarangays(db);
    expect(db.select().from(barangay).all()).toHaveLength(SEED_BARANGAYS.length);
  });

  it("accepts an additional list for a barangay outside this seed set, without touching the file", () => {
    const db = createTestDb();
    seedBarangays(db, [{ code: "TEST-EXTRA", name: "Barangay Test Extra" }]);
    const rows = db.select().from(barangay).all();
    expect(rows).toHaveLength(SEED_BARANGAYS.length + 1);
    expect(rows.map((r) => r.code)).toContain("TEST-EXTRA");
  });

  it("still won't duplicate a barangay passed in the additional list on a second run", () => {
    const db = createTestDb();
    const extra = [{ code: "TEST-EXTRA", name: "Barangay Test Extra" }];
    seedBarangays(db, extra);
    seedBarangays(db, extra);
    expect(db.select().from(barangay).all()).toHaveLength(SEED_BARANGAYS.length + 1);
  });
});
