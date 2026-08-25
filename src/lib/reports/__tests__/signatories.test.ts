import { describe, it, expect } from "vitest";
import { createTestDb } from "../../../db/testDb";
import { appUser, barangay as barangayTable } from "../../../db/schema";
import { recordSignatory } from "../../engine/signatories";
import { getEffectiveSignatories } from "../signatories";

async function setUp() {
  const db = createTestDb();
  const b = await db.query.insert(barangayTable).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().get();
  const admin = await db.query
    .insert(appUser)
    .values({ username: "admin", passwordHash: "x", fullName: "Test Admin", role: "admin" })
    .returning()
    .get();
  return { db, barangay: b, admin };
}

describe("getEffectiveSignatories", () => {
  it("is all null for a barangay with no signatories on file", async () => {
    const { db, barangay } = await setUp();
    const result = await getEffectiveSignatories(db, barangay.id, "2026-01-31");
    expect(result.prepared_by).toBeNull();
    expect(result.certified_by).toBeNull();
    expect(result.approved_by).toBeNull();
  });

  it("resolves the most recent signatory on or before the as-of date", async () => {
    const { db, barangay, admin } = await setUp();
    await recordSignatory(db, {
      barangayId: barangay.id,
      role: "prepared_by",
      name: "Juan Dela Cruz",
      designation: "Barangay Bookkeeper",
      effectiveFrom: "2026-01-01",
      recordedBy: admin.id,
    });

    const result = await getEffectiveSignatories(db, barangay.id, "2026-01-31");
    expect(result.prepared_by).toEqual({
      name: "Juan Dela Cruz",
      designation: "Barangay Bookkeeper",
      effectiveFrom: "2026-01-01",
    });
  });

  it("is null when the only signatory on file takes effect after the as-of date", async () => {
    const { db, barangay, admin } = await setUp();
    await recordSignatory(db, {
      barangayId: barangay.id,
      role: "prepared_by",
      name: "Juan Dela Cruz",
      designation: "Barangay Bookkeeper",
      effectiveFrom: "2026-06-01",
      recordedBy: admin.id,
    });

    const result = await getEffectiveSignatories(db, barangay.id, "2026-01-31");
    expect(result.prepared_by).toBeNull();
  });

  it("picks the newer of two signatories once their effective date has passed (D25 — officials change)", async () => {
    const { db, barangay, admin } = await setUp();
    await recordSignatory(db, {
      barangayId: barangay.id,
      role: "approved_by",
      name: "Maria Santos",
      designation: "Punong Barangay",
      effectiveFrom: "2020-01-01",
      recordedBy: admin.id,
    });
    await recordSignatory(db, {
      barangayId: barangay.id,
      role: "approved_by",
      name: "Pedro Reyes",
      designation: "Punong Barangay",
      effectiveFrom: "2025-01-01",
      recordedBy: admin.id,
    });

    const asOf2022 = await getEffectiveSignatories(db, barangay.id, "2022-12-31");
    expect(asOf2022.approved_by?.name).toBe("Maria Santos");

    const asOf2026 = await getEffectiveSignatories(db, barangay.id, "2026-01-31");
    expect(asOf2026.approved_by?.name).toBe("Pedro Reyes");
  });

  it("resolves each role independently", async () => {
    const { db, barangay, admin } = await setUp();
    await recordSignatory(db, {
      barangayId: barangay.id,
      role: "prepared_by",
      name: "Juan Dela Cruz",
      designation: "Barangay Bookkeeper",
      effectiveFrom: "2026-01-01",
      recordedBy: admin.id,
    });

    const result = await getEffectiveSignatories(db, barangay.id, "2026-01-31");
    expect(result.prepared_by?.name).toBe("Juan Dela Cruz");
    expect(result.certified_by).toBeNull();
    expect(result.approved_by).toBeNull();
  });

  it("excludes another barangay's signatories", async () => {
    const { db, barangay, admin } = await setUp();
    const other = await db.query.insert(barangayTable).values({ code: "OTH", name: "Barangay Other" }).returning().get();
    await recordSignatory(db, {
      barangayId: other.id,
      role: "prepared_by",
      name: "Someone Else",
      designation: "Barangay Bookkeeper",
      effectiveFrom: "2026-01-01",
      recordedBy: admin.id,
    });

    const result = await getEffectiveSignatories(db, barangay.id, "2026-01-31");
    expect(result.prepared_by).toBeNull();
  });
});
