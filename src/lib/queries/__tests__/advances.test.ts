import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "../../engine/__tests__/fixtures";
import { seedPlaceholderUser } from "../../../db/seed/users";
import { barangay as barangayTable } from "../../../db/schema";
import { toCentavos } from "../../money";
import { createAdvanceAction, liquidateAdvanceAction, listAdvances } from "../advances";

async function seedForWrites() {
  const fixture = await seedEngineFixture();
  await seedPlaceholderUser(fixture.db);
  return fixture;
}

describe("createAdvanceAction / listAdvances", () => {
  it("grants an advance, resolving the placeholder actor (D32) without a screen ever passing one", async () => {
    const { db, barangay } = await seedForWrites();

    await createAdvanceAction(db, {
      barangayId: barangay.id,
      dateGranted: "2026-03-10",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance",
      amountCentavos: toCentavos(15000),
    });

    const rows = await listAdvances(db, barangay.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].payee).toBe("Juan Dela Cruz");
    expect(rows[0].status).toBe("outstanding");
    expect(rows[0].liquidatedCentavos).toBe(0);
  });

  it("lists advances oldest-grant first, and never another barangay's advances", async () => {
    const { db, barangay } = await seedForWrites();
    const other = await db.query.insert(barangayTable).values({ code: "OTH", name: "Barangay Other" }).returning().get();

    await createAdvanceAction(db, {
      barangayId: barangay.id,
      dateGranted: "2026-06-01",
      payee: "Newer grant",
      particulars: "Travel advance",
      amountCentavos: toCentavos(1000),
    });
    await createAdvanceAction(db, {
      barangayId: barangay.id,
      dateGranted: "2026-01-01",
      payee: "Older grant",
      particulars: "Travel advance",
      amountCentavos: toCentavos(1000),
    });
    await createAdvanceAction(db, {
      barangayId: other.id,
      dateGranted: "2025-01-01",
      payee: "Other barangay's grant",
      particulars: "Travel advance",
      amountCentavos: toCentavos(1000),
    });

    const rows = await listAdvances(db, barangay.id);
    expect(rows.map((r) => r.payee)).toEqual(["Older grant", "Newer grant"]);
  });
});

describe("liquidateAdvanceAction", () => {
  it("records a partial liquidation, keeping the advance outstanding", async () => {
    const { db, barangay } = await seedForWrites();
    const advance = await createAdvanceAction(db, {
      barangayId: barangay.id,
      dateGranted: "2026-03-10",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance",
      amountCentavos: toCentavos(15000),
    });

    await liquidateAdvanceAction(db, { advanceId: advance.id, amountCentavos: toCentavos(5000) });

    const rows = await listAdvances(db, barangay.id);
    expect(rows[0].liquidatedCentavos).toBe(toCentavos(5000));
    expect(rows[0].status).toBe("outstanding");
  });

  it("flips status to liquidated once the running total reaches the amount granted", async () => {
    const { db, barangay } = await seedForWrites();
    const advance = await createAdvanceAction(db, {
      barangayId: barangay.id,
      dateGranted: "2026-03-10",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance",
      amountCentavos: toCentavos(15000),
    });

    await liquidateAdvanceAction(db, { advanceId: advance.id, amountCentavos: toCentavos(15000) });

    const rows = await listAdvances(db, barangay.id);
    expect(rows[0].status).toBe("liquidated");
  });
});
