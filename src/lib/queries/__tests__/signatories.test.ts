import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "../../engine/__tests__/fixtures";
import { seedPlaceholderUser } from "../../../db/seed/users";
import { barangay as barangayTable } from "../../../db/schema";
import { createSignatoryAction, listSignatories } from "../signatories";

async function seedForWrites() {
  const fixture = await seedEngineFixture();
  await seedPlaceholderUser(fixture.db);
  return fixture;
}

describe("createSignatoryAction / listSignatories", () => {
  it("adds a signatory, resolving the placeholder actor (D32) without a screen ever passing one", async () => {
    const { db, barangay } = await seedForWrites();

    await createSignatoryAction(db, {
      barangayId: barangay.id,
      role: "prepared_by",
      name: "Juan Dela Cruz",
      designation: "Barangay Bookkeeper",
      effectiveFrom: "2026-01-01",
    });

    const rows = await listSignatories(db, barangay.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Juan Dela Cruz");
    expect(rows[0].role).toBe("prepared_by");
  });

  it("lists by role then effective date, oldest first, and never another barangay's signatories", async () => {
    const { db, barangay } = await seedForWrites();
    const other = await db.query.insert(barangayTable).values({ code: "OTH", name: "Barangay Other" }).returning().get();

    await createSignatoryAction(db, {
      barangayId: barangay.id,
      role: "approved_by",
      name: "Newer officer",
      designation: "Punong Barangay",
      effectiveFrom: "2026-01-01",
    });
    await createSignatoryAction(db, {
      barangayId: barangay.id,
      role: "approved_by",
      name: "Older officer",
      designation: "Punong Barangay",
      effectiveFrom: "2020-01-01",
    });
    await createSignatoryAction(db, {
      barangayId: other.id,
      role: "approved_by",
      name: "Other barangay's officer",
      designation: "Punong Barangay",
      effectiveFrom: "2020-01-01",
    });

    const rows = await listSignatories(db, barangay.id);
    expect(rows.map((r) => r.name)).toEqual(["Older officer", "Newer officer"]);
  });
});
