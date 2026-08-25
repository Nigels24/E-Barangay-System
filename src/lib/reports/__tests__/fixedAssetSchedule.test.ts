import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../../db/testDb";
import { account, appUser, barangay as barangayTable, fixedAsset } from "../../../db/schema";
import { createDraftEntry, postEntry } from "../../engine/post";
import { ensurePeriod } from "../../engine/period";
import { recordFixedAsset } from "../../engine/fixedAssets";
import { accumulatedDepreciationCentavos, monthsDepreciated } from "../../depreciation";
import { toCentavos } from "../../money";
import { buildFixedAssetSchedule } from "../fixedAssetSchedule";

async function setUp() {
  const db = createTestDb();
  const b = await db.query.insert(barangayTable).values({ code: "UPS", name: "Barangay Upper Sibatang" }).returning().get();
  const admin = await db.query
    .insert(appUser)
    .values({ username: "admin", passwordHash: "x", fullName: "Test Admin", role: "admin" })
    .returning()
    .get();
  const officeEquipment = await db.query
    .insert(account)
    .values({ code: "1-07-05-020", name: "Office Equipment", accountType: "asset", normalBalance: "debit" })
    .returning()
    .get();
  const equity = await db.query
    .insert(account)
    .values({ code: "3-01-01-010", name: "Government Equity", accountType: "equity", normalBalance: "credit" })
    .returning()
    .get();
  return { db, barangay: b, admin, officeEquipment, equity };
}

describe("buildFixedAssetSchedule", () => {
  it("is empty for a barangay with no assets", async () => {
    const { db, barangay } = await setUp();
    const result = await buildFixedAssetSchedule(db, barangay.id, 2024, 6);
    expect(result.rows).toEqual([]);
    expect(result.categoryTotals).toEqual([]);
    expect(result.totalCostCentavos).toBe(0);
    expect(result.costVariance).toEqual([]);
  });

  it("computes depreciation exactly as depreciation.ts's own functions would", async () => {
    const { db, barangay, admin, officeEquipment } = await setUp();
    await recordFixedAsset(db, {
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "Steel filing cabinet",
      acquisitionDate: "2023-03-10",
      costCentavos: toCentavos(15000),
      usefulLifeYears: 10,
      residualRate: 0.1,
      accountId: officeEquipment.id,
      recordedBy: admin.id,
    });

    const result = await buildFixedAssetSchedule(db, barangay.id, 2024, 6);
    expect(result.rows).toHaveLength(1);
    const row = result.rows[0];

    const asOfDate = "2024-06-30";
    const months = monthsDepreciated("2023-03-10", asOfDate, 10);
    const expectedAccumulated = accumulatedDepreciationCentavos(toCentavos(15000), 10, 0.1, months);

    expect(row.accumulatedDepreciationCentavos).toBe(expectedAccumulated);
    expect(row.bookValueCentavos).toBe(toCentavos(15000) - expectedAccumulated);
    expect(row.costCentavos).toBe(toCentavos(15000));
  });

  it("excludes an asset acquired after the as-of date", async () => {
    const { db, barangay, admin, officeEquipment } = await setUp();
    await recordFixedAsset(db, {
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "Bought next year",
      acquisitionDate: "2025-01-01",
      costCentavos: toCentavos(1000),
      usefulLifeYears: 5,
      residualRate: 0.1,
      accountId: officeEquipment.id,
      recordedBy: admin.id,
    });

    const result = await buildFixedAssetSchedule(db, barangay.id, 2024, 6);
    expect(result.rows).toEqual([]);
  });

  it("excludes an asset disposed on or before the as-of date, but keeps one disposed later", async () => {
    const { db, barangay, admin, officeEquipment } = await setUp();
    await db.query.insert(fixedAsset).values({
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "Disposed before report date",
      acquisitionDate: "2020-01-01",
      costCentavos: toCentavos(1000),
      usefulLifeYears: 5,
      residualRate: "0.10",
      accountId: officeEquipment.id,
      disposalDate: "2024-05-01",
    });
    await recordFixedAsset(db, {
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "Disposed after report date",
      acquisitionDate: "2020-01-01",
      costCentavos: toCentavos(2000),
      usefulLifeYears: 5,
      residualRate: 0.1,
      accountId: officeEquipment.id,
      recordedBy: admin.id,
    });
    // Give the second one a future disposal date directly, since recordFixedAsset never sets one.
    const rows0 = await db.query.select().from(fixedAsset).all();
    const secondId = rows0.find((r) => r.description === "Disposed after report date")!.id;
    await db.query.update(fixedAsset).set({ disposalDate: "2024-07-15" }).where(eq(fixedAsset.id, secondId)).run();

    const result = await buildFixedAssetSchedule(db, barangay.id, 2024, 6);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].description).toBe("Disposed after report date");
  });

  it("sums category totals across multiple assets in the same category", async () => {
    const { db, barangay, admin, officeEquipment } = await setUp();
    await recordFixedAsset(db, {
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "Item A",
      acquisitionDate: "2023-01-01",
      costCentavos: toCentavos(10000),
      usefulLifeYears: 10,
      residualRate: 0.1,
      accountId: officeEquipment.id,
      recordedBy: admin.id,
    });
    await recordFixedAsset(db, {
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "Item B",
      acquisitionDate: "2023-01-01",
      costCentavos: toCentavos(20000),
      usefulLifeYears: 10,
      residualRate: 0.1,
      accountId: officeEquipment.id,
      recordedBy: admin.id,
    });

    const result = await buildFixedAssetSchedule(db, barangay.id, 2024, 6);
    expect(result.categoryTotals).toHaveLength(1);
    expect(result.categoryTotals[0].costCentavos).toBe(toCentavos(30000));
    expect(result.totalCostCentavos).toBe(toCentavos(30000));
  });

  describe("D21's cost variance against the ledger", () => {
    it("is zero when the register's cost matches the ledger's posted balance", async () => {
      const { db, barangay, admin, officeEquipment, equity } = await setUp();
      await recordFixedAsset(db, {
        barangayId: barangay.id,
        category: "Office Equipment",
        description: "Matches the ledger",
        acquisitionDate: "2023-01-01",
        costCentavos: toCentavos(10000),
        usefulLifeYears: 10,
        residualRate: 0.1,
        accountId: officeEquipment.id,
        recordedBy: admin.id,
      });

      const period = await ensurePeriod(db, barangay.id, 2024, 6);
      const draft = await createDraftEntry(db, {
        barangayId: barangay.id,
        periodId: period.id,
        entryDate: "2024-06-01",
        book: "GJ",
        particulars: "Opening balance for office equipment",
        createdBy: admin.id,
        lines: [
          { accountId: officeEquipment.id, side: "debit", amountCentavos: toCentavos(10000) },
          { accountId: equity.id, side: "credit", amountCentavos: toCentavos(10000) },
        ],
      });
      await postEntry(db, { entryId: draft.id, postedBy: admin.id });

      const result = await buildFixedAssetSchedule(db, barangay.id, 2024, 6);
      expect(result.costVariance).toHaveLength(1);
      expect(result.costVariance[0].registerCostCentavos).toBe(toCentavos(10000));
      expect(result.costVariance[0].ledgerBalanceCentavos).toBe(toCentavos(10000));
      expect(result.costVariance[0].varianceCentavos).toBe(0);
    });

    it("surfaces a nonzero variance rather than hiding or forcing agreement (D21)", async () => {
      const { db, barangay, admin, officeEquipment, equity } = await setUp();
      await recordFixedAsset(db, {
        barangayId: barangay.id,
        category: "Office Equipment",
        description: "Register says 10,000",
        acquisitionDate: "2023-01-01",
        costCentavos: toCentavos(10000),
        usefulLifeYears: 10,
        residualRate: 0.1,
        accountId: officeEquipment.id,
        recordedBy: admin.id,
      });

      const period = await ensurePeriod(db, barangay.id, 2024, 6);
      const draft = await createDraftEntry(db, {
        barangayId: barangay.id,
        periodId: period.id,
        entryDate: "2024-06-01",
        book: "GJ",
        particulars: "Ledger only shows 6,000",
        createdBy: admin.id,
        lines: [
          { accountId: officeEquipment.id, side: "debit", amountCentavos: toCentavos(6000) },
          { accountId: equity.id, side: "credit", amountCentavos: toCentavos(6000) },
        ],
      });
      await postEntry(db, { entryId: draft.id, postedBy: admin.id });

      const result = await buildFixedAssetSchedule(db, barangay.id, 2024, 6);
      expect(result.costVariance[0].registerCostCentavos).toBe(toCentavos(10000));
      expect(result.costVariance[0].ledgerBalanceCentavos).toBe(toCentavos(6000));
      expect(result.costVariance[0].varianceCentavos).toBe(toCentavos(4000));
    });

    it("has no ledger balance at all when nothing was ever posted to the linked account", async () => {
      const { db, barangay, admin, officeEquipment } = await setUp();
      await recordFixedAsset(db, {
        barangayId: barangay.id,
        category: "Office Equipment",
        description: "Never posted",
        acquisitionDate: "2023-01-01",
        costCentavos: toCentavos(10000),
        usefulLifeYears: 10,
        residualRate: 0.1,
        accountId: officeEquipment.id,
        recordedBy: admin.id,
      });

      const result = await buildFixedAssetSchedule(db, barangay.id, 2024, 6);
      expect(result.costVariance[0].ledgerBalanceCentavos).toBe(0);
      expect(result.costVariance[0].varianceCentavos).toBe(toCentavos(10000));
    });

    it("skips an asset with no linked account entirely — nothing to compare", async () => {
      const { db, barangay, admin } = await setUp();
      await recordFixedAsset(db, {
        barangayId: barangay.id,
        category: "Unmapped",
        description: "No account link yet",
        acquisitionDate: "2023-01-01",
        costCentavos: toCentavos(10000),
        usefulLifeYears: 10,
        residualRate: 0.1,
        recordedBy: admin.id,
      });

      const result = await buildFixedAssetSchedule(db, barangay.id, 2024, 6);
      expect(result.costVariance).toEqual([]);
    });
  });
});
