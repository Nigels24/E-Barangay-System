import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "../../engine/__tests__/fixtures";
import { seedPlaceholderUser } from "../../../db/seed/users";
import { runSeed } from "../../../db/seed";
import { createTestDb } from "../../../db/testDb";
import { account, barangay as barangayTable } from "../../../db/schema";
import { toCentavos } from "../../money";
import {
  createFixedAssetAction,
  disposeFixedAssetAction,
  listFixedAssetAccounts,
  listFixedAssets,
} from "../fixedAssets";

describe("listFixedAssetAccounts", () => {
  it("offers only the PPE (1-07-) accounts, and never their accumulated-depreciation contra accounts", async () => {
    const db = createTestDb();
    await runSeed(db);

    const options = await listFixedAssetAccounts(db);
    expect(options.length).toBeGreaterThan(0);
    for (const option of options) {
      expect(option.code.startsWith("1-07-")).toBe(true);
      expect(option.name.startsWith("Accumulated Depreciation")).toBe(false);
    }
    // Office Equipment is a real seeded PPE account; its contra pair is not offered.
    expect(options.some((o) => o.code === "1-07-05-020")).toBe(true);
    expect(options.some((o) => o.code === "1-07-05-021")).toBe(false);
  });

  it("hides an inactive PPE account", async () => {
    const db = createTestDb();
    await db.query
      .insert(account)
      .values({
        code: "1-07-99-999",
        name: "Retired PPE account",
        accountType: "asset",
        normalBalance: "debit",
        isActive: false,
      })
      .run();
    expect(await listFixedAssetAccounts(db)).toHaveLength(0);
  });
});

async function seedForWrites() {
  const fixture = await seedEngineFixture();
  await seedPlaceholderUser(fixture.db);
  const officeEquipment = await fixture.db.query
    .insert(account)
    .values({ code: "1-07-05-020", name: "Office Equipment", accountType: "asset", normalBalance: "debit" })
    .returning()
    .get();
  return { ...fixture, officeEquipment };
}

describe("createFixedAssetAction / listFixedAssets", () => {
  it("records an asset, resolving the placeholder actor (D32) without a screen ever passing one", async () => {
    const { db, barangay, officeEquipment } = await seedForWrites();

    await createFixedAssetAction(db, {
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "Steel filing cabinet",
      acquisitionDate: "2023-03-10",
      costCentavos: toCentavos(15000),
      usefulLifeYears: 10,
      residualRate: 0.1,
      accountId: officeEquipment.id,
    });

    const rows = await listFixedAssets(db, barangay.id);
    expect(rows).toHaveLength(1);
    expect(rows[0].description).toBe("Steel filing cabinet");
    expect(rows[0].accountCode).toBe("1-07-05-020");
    expect(rows[0].residualRate).toBe(0.1);
    expect(rows[0].disposalDate).toBeNull();
  });

  it("lists assets oldest-acquisition first, and never another barangay's assets", async () => {
    const { db, barangay, officeEquipment } = await seedForWrites();
    const other = await db.query.insert(barangayTable).values({ code: "OTH", name: "Barangay Other" }).returning().get();

    await createFixedAssetAction(db, {
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "Newer item",
      acquisitionDate: "2023-06-01",
      costCentavos: toCentavos(1000),
      usefulLifeYears: 5,
      residualRate: 0.1,
      accountId: officeEquipment.id,
    });
    await createFixedAssetAction(db, {
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "Older item",
      acquisitionDate: "2020-01-01",
      costCentavos: toCentavos(1000),
      usefulLifeYears: 5,
      residualRate: 0.1,
      accountId: officeEquipment.id,
    });
    await createFixedAssetAction(db, {
      barangayId: other.id,
      category: "Office Equipment",
      description: "Other barangay's item",
      acquisitionDate: "2019-01-01",
      costCentavos: toCentavos(1000),
      usefulLifeYears: 5,
      residualRate: 0.1,
      accountId: officeEquipment.id,
    });

    const rows = await listFixedAssets(db, barangay.id);
    expect(rows.map((r) => r.description)).toEqual(["Older item", "Newer item"]);
  });
});

describe("disposeFixedAssetAction", () => {
  it("marks an asset disposed", async () => {
    const { db, barangay, officeEquipment } = await seedForWrites();
    const asset = await createFixedAssetAction(db, {
      barangayId: barangay.id,
      category: "Office Equipment",
      description: "Steel filing cabinet",
      acquisitionDate: "2023-03-10",
      costCentavos: toCentavos(15000),
      usefulLifeYears: 10,
      residualRate: 0.1,
      accountId: officeEquipment.id,
    });

    await disposeFixedAssetAction(db, { assetId: asset.id, disposalDate: "2025-06-30" });

    const rows = await listFixedAssets(db, barangay.id);
    expect(rows[0].disposalDate).toBe("2025-06-30");
  });
});
