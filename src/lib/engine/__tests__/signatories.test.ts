import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "./fixtures";
import { recordSignatory } from "../signatories";
import { InvalidStatusError } from "../errors";
import { auditLog } from "../../../db/schema";
import { eq } from "drizzle-orm";

describe("recordSignatory", () => {
  it("adds a signatory and audit-logs the write", async () => {
    const { db, barangay, admin } = await seedEngineFixture();

    const s = await recordSignatory(db, {
      barangayId: barangay.id,
      role: "prepared_by",
      name: "Juan Dela Cruz",
      designation: "Barangay Bookkeeper",
      effectiveFrom: "2026-01-01",
      recordedBy: admin.id,
    });

    expect(s.id).toBeGreaterThan(0);
    expect(s.role).toBe("prepared_by");
    expect(s.name).toBe("Juan Dela Cruz");
    expect(s.designation).toBe("Barangay Bookkeeper");

    const audit = await db.query.select().from(auditLog).where(eq(auditLog.tableName, "signatory")).all();
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("signatory.create");
    expect(audit[0].userId).toBe(admin.id);
  });

  it("allows more than one signatory for the same role over time (D25 — officials change)", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    await recordSignatory(db, {
      barangayId: barangay.id,
      role: "approved_by",
      name: "Maria Santos",
      designation: "Punong Barangay",
      effectiveFrom: "2020-01-01",
      recordedBy: admin.id,
    });
    const second = await recordSignatory(db, {
      barangayId: barangay.id,
      role: "approved_by",
      name: "Pedro Reyes",
      designation: "Punong Barangay",
      effectiveFrom: "2026-01-01",
      recordedBy: admin.id,
    });
    expect(second.name).toBe("Pedro Reyes");
  });

  it("refuses an invalid role", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    await expect(
      recordSignatory(db, {
        barangayId: barangay.id,
        role: "signed_by" as never,
        name: "Juan Dela Cruz",
        designation: "Barangay Bookkeeper",
        effectiveFrom: "2026-01-01",
        recordedBy: admin.id,
      }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses a blank name, designation, or effective date", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const base = { barangayId: barangay.id, role: "prepared_by" as const, recordedBy: admin.id };
    await expect(
      recordSignatory(db, { ...base, name: "  ", designation: "Bookkeeper", effectiveFrom: "2026-01-01" }),
    ).rejects.toThrow(InvalidStatusError);
    await expect(
      recordSignatory(db, { ...base, name: "Juan", designation: "", effectiveFrom: "2026-01-01" }),
    ).rejects.toThrow(InvalidStatusError);
    await expect(
      recordSignatory(db, { ...base, name: "Juan", designation: "Bookkeeper", effectiveFrom: "" }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses a second signatory for the same barangay/role/effective date (schema's own unique index)", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const input = {
      barangayId: barangay.id,
      role: "certified_by" as const,
      name: "Juan Dela Cruz",
      designation: "Barangay Treasurer",
      effectiveFrom: "2026-01-01",
      recordedBy: admin.id,
    };
    await recordSignatory(db, input);
    await expect(recordSignatory(db, input)).rejects.toThrow();
  });
});
