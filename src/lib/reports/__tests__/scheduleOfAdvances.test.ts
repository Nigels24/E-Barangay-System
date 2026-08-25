import { describe, it, expect } from "vitest";
import { createTestDb } from "../../../db/testDb";
import { appUser, barangay as barangayTable } from "../../../db/schema";
import { recordAdvance, liquidateAdvance } from "../../engine/advances";
import { toCentavos } from "../../money";
import { buildScheduleOfAdvances } from "../scheduleOfAdvances";

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

describe("buildScheduleOfAdvances", () => {
  it("is empty for a barangay with no advances", async () => {
    const { db, barangay } = await setUp();
    const result = await buildScheduleOfAdvances(db, barangay.id, 2026, 3);
    expect(result.rows).toEqual([]);
    expect(result.totalAmountCentavos).toBe(0);
    expect(result.totalLiquidatedCentavos).toBe(0);
    expect(result.totalBalanceCentavos).toBe(0);
  });

  it("lists an outstanding advance with its running balance", async () => {
    const { db, barangay, admin } = await setUp();
    await recordAdvance(db, {
      barangayId: barangay.id,
      dateGranted: "2026-03-10",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance",
      amountCentavos: toCentavos(15000),
      recordedBy: admin.id,
    });

    const result = await buildScheduleOfAdvances(db, barangay.id, 2026, 3);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].payee).toBe("Juan Dela Cruz");
    expect(result.rows[0].amountCentavos).toBe(toCentavos(15000));
    expect(result.rows[0].liquidatedCentavos).toBe(0);
    expect(result.rows[0].balanceCentavos).toBe(toCentavos(15000));
    expect(result.totalAmountCentavos).toBe(toCentavos(15000));
    expect(result.totalBalanceCentavos).toBe(toCentavos(15000));
  });

  it("carries a partially liquidated advance's true balance", async () => {
    const { db, barangay, admin } = await setUp();
    const advance = await recordAdvance(db, {
      barangayId: barangay.id,
      dateGranted: "2026-03-10",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance",
      amountCentavos: toCentavos(15000),
      recordedBy: admin.id,
    });
    await liquidateAdvance(db, { advanceId: advance.id, amountCentavos: toCentavos(4000), liquidatedBy: admin.id });

    const result = await buildScheduleOfAdvances(db, barangay.id, 2026, 3);
    expect(result.rows[0].liquidatedCentavos).toBe(toCentavos(4000));
    expect(result.rows[0].balanceCentavos).toBe(toCentavos(11000));
  });

  it("excludes an advance already fully liquidated", async () => {
    const { db, barangay, admin } = await setUp();
    const advance = await recordAdvance(db, {
      barangayId: barangay.id,
      dateGranted: "2026-03-10",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance",
      amountCentavos: toCentavos(15000),
      recordedBy: admin.id,
    });
    await liquidateAdvance(db, { advanceId: advance.id, amountCentavos: toCentavos(15000), liquidatedBy: admin.id });

    const result = await buildScheduleOfAdvances(db, barangay.id, 2026, 3);
    expect(result.rows).toEqual([]);
  });

  it("excludes an advance granted after the as-of date", async () => {
    const { db, barangay, admin } = await setUp();
    await recordAdvance(db, {
      barangayId: barangay.id,
      dateGranted: "2026-04-01",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance",
      amountCentavos: toCentavos(1000),
      recordedBy: admin.id,
    });

    const result = await buildScheduleOfAdvances(db, barangay.id, 2026, 3);
    expect(result.rows).toEqual([]);
  });

  it("excludes another barangay's advances", async () => {
    const { db, barangay, admin } = await setUp();
    const other = await db.query.insert(barangayTable).values({ code: "OTH", name: "Barangay Other" }).returning().get();
    await recordAdvance(db, {
      barangayId: other.id,
      dateGranted: "2026-03-10",
      payee: "Someone Else",
      particulars: "Travel advance",
      amountCentavos: toCentavos(1000),
      recordedBy: admin.id,
    });

    const result = await buildScheduleOfAdvances(db, barangay.id, 2026, 3);
    expect(result.rows).toEqual([]);
  });

  it("sums totals across multiple outstanding advances, sorted by grant date", async () => {
    const { db, barangay, admin } = await setUp();
    await recordAdvance(db, {
      barangayId: barangay.id,
      dateGranted: "2026-03-15",
      payee: "Granted later",
      particulars: "Travel advance",
      amountCentavos: toCentavos(5000),
      recordedBy: admin.id,
    });
    await recordAdvance(db, {
      barangayId: barangay.id,
      dateGranted: "2026-03-01",
      payee: "Granted earlier",
      particulars: "Travel advance",
      amountCentavos: toCentavos(10000),
      recordedBy: admin.id,
    });

    const result = await buildScheduleOfAdvances(db, barangay.id, 2026, 3);
    expect(result.rows.map((r) => r.payee)).toEqual(["Granted earlier", "Granted later"]);
    expect(result.totalAmountCentavos).toBe(toCentavos(15000));
  });

  it("reports as of the period's own end date", async () => {
    const { db, barangay } = await setUp();
    const result = await buildScheduleOfAdvances(db, barangay.id, 2026, 3);
    expect(result.asOfDate).toBe("2026-03-31");
  });
});
