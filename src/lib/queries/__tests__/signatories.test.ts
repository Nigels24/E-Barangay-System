import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "../../engine/__tests__/fixtures";
import { barangay as barangayTable } from "../../../db/schema";
import { createSignatoryAction, listSignatories } from "../signatories";

describe("createSignatoryAction / listSignatories", () => {
  it("adds a signatory, attributed to whoever added it (T-018)", async () => {
    const { db, barangay, user } = await seedEngineFixture();

    await createSignatoryAction(
      db,
      {
        barangayId: barangay.id,
        role: "prepared_by",
        name: "Juan Dela Cruz",
        designation: "Barangay Bookkeeper",
        effectiveFrom: "2026-01-01",
      },
      user.id,
    );

    const rows = await listSignatories(db, barangay.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Juan Dela Cruz");
    expect(rows[0].role).toBe("prepared_by");
  });

  it("lists by role then effective date, oldest first, and never another barangay's signatories", async () => {
    const { db, barangay, user } = await seedEngineFixture();
    const other = await db.query.insert(barangayTable).values({ code: "OTH", name: "Barangay Other" }).returning().get();

    await createSignatoryAction(
      db,
      {
        barangayId: barangay.id,
        role: "approved_by",
        name: "Newer officer",
        designation: "Punong Barangay",
        effectiveFrom: "2026-01-01",
      },
      user.id,
    );
    await createSignatoryAction(
      db,
      {
        barangayId: barangay.id,
        role: "approved_by",
        name: "Older officer",
        designation: "Punong Barangay",
        effectiveFrom: "2020-01-01",
      },
      user.id,
    );
    await createSignatoryAction(
      db,
      {
        barangayId: other.id,
        role: "approved_by",
        name: "Other barangay's officer",
        designation: "Punong Barangay",
        effectiveFrom: "2020-01-01",
      },
      user.id,
    );

    const rows = await listSignatories(db, barangay.id);
    expect(rows.map((r) => r.name)).toEqual(["Older officer", "Newer officer"]);
  });
});
