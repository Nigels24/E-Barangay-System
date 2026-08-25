import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "./fixtures";
import { disposeFixedAsset, recordFixedAsset } from "../fixedAssets";
import { InvalidStatusError } from "../errors";
import { auditLog, account } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { toCentavos } from "../../money";

async function seedAssetAccount(db: Awaited<ReturnType<typeof seedEngineFixture>>["db"]) {
  return db.query
    .insert(account)
    .values({ code: "1-07-05-020", name: "Office Equipment", accountType: "asset", normalBalance: "debit" })
    .returning()
    .get();
}

describe("recordFixedAsset", () => {
  it("adds an asset to the register and audit-logs the write", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const officeEquipment = await seedAssetAccount(db);

    const asset = await recordFixedAsset(db, {
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

    expect(asset.id).toBeGreaterThan(0);
    expect(asset.category).toBe("Office Equipment");
    expect(asset.costCentavos).toBe(toCentavos(15000));
    expect(asset.disposalDate).toBeNull();

    const audit = await db.query.select().from(auditLog).where(eq(auditLog.tableName, "fixed_asset")).all();
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("fixed_asset.create");
    expect(audit[0].userId).toBe(admin.id);
  });

  it("works with no linked account and no legacy code — both are genuinely optional", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const asset = await recordFixedAsset(db, {
      barangayId: barangay.id,
      category: "Other Equipment",
      description: "Unmapped legacy item",
      acquisitionDate: "2020-01-01",
      costCentavos: toCentavos(5000),
      usefulLifeYears: 5,
      residualRate: 0.1,
      recordedBy: admin.id,
    });
    expect(asset.accountId).toBeNull();
    expect(asset.legacyCode).toBeNull();
  });

  it("keeps the legacy FA-schedule code for tracing (D20)", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const asset = await recordFixedAsset(db, {
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "Old-numbered desk",
      acquisitionDate: "2015-06-01",
      costCentavos: toCentavos(3000),
      usefulLifeYears: 10,
      residualRate: 0.1,
      legacyCode: "221",
      recordedBy: admin.id,
    });
    expect(asset.legacyCode).toBe("221");
  });

  it("refuses a blank category or description", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const base = {
      barangayId: barangay.id,
      acquisitionDate: "2023-01-01",
      costCentavos: toCentavos(1000),
      usefulLifeYears: 5,
      residualRate: 0.1,
      recordedBy: admin.id,
    };
    await expect(recordFixedAsset(db, { ...base, category: "  ", description: "A desk" })).rejects.toThrow(
      InvalidStatusError,
    );
    await expect(recordFixedAsset(db, { ...base, category: "Office Equipment", description: "" })).rejects.toThrow(
      InvalidStatusError,
    );
  });

  it("refuses the same bad life/cost/residual-rate combinations annualDepreciationCentavos itself refuses", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const base = {
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "A desk",
      acquisitionDate: "2023-01-01",
      costCentavos: toCentavos(1000),
      recordedBy: admin.id,
    };
    await expect(recordFixedAsset(db, { ...base, usefulLifeYears: 0, residualRate: 0.1 })).rejects.toThrow();
    await expect(recordFixedAsset(db, { ...base, usefulLifeYears: 5, residualRate: 1 })).rejects.toThrow();
  });
});

describe("disposeFixedAsset", () => {
  async function addAsset(db: Awaited<ReturnType<typeof seedEngineFixture>>["db"], barangayId: number, adminId: number) {
    return recordFixedAsset(db, {
      barangayId,
      category: "Office Equipment",
      description: "Steel filing cabinet",
      acquisitionDate: "2023-03-10",
      costCentavos: toCentavos(15000),
      usefulLifeYears: 10,
      residualRate: 0.1,
      recordedBy: adminId,
    });
  }

  it("records a disposal date and audit-logs it", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const asset = await addAsset(db, barangay.id, admin.id);

    const disposed = await disposeFixedAsset(db, { assetId: asset.id, disposalDate: "2025-06-30", disposedBy: admin.id });
    expect(disposed.disposalDate).toBe("2025-06-30");

    const audit = await db.query
      .select()
      .from(auditLog)
      .where(eq(auditLog.tableName, "fixed_asset"))
      .all();
    expect(audit.some((row) => row.action === "fixed_asset.dispose")).toBe(true);
  });

  it("refuses to dispose an asset that was already disposed", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const asset = await addAsset(db, barangay.id, admin.id);
    await disposeFixedAsset(db, { assetId: asset.id, disposalDate: "2025-06-30", disposedBy: admin.id });

    await expect(
      disposeFixedAsset(db, { assetId: asset.id, disposalDate: "2025-07-15", disposedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses a disposal date earlier than acquisition", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const asset = await addAsset(db, barangay.id, admin.id);

    await expect(
      disposeFixedAsset(db, { assetId: asset.id, disposalDate: "2020-01-01", disposedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses an asset that does not exist", async () => {
    const { db, admin } = await seedEngineFixture();
    await expect(
      disposeFixedAsset(db, { assetId: 999999, disposalDate: "2025-01-01", disposedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });
});
