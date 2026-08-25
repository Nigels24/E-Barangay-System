/**
 * The fixed-asset register: recording an asset, and recording its disposal.
 *
 * Unlike a journal entry, adding a fixed asset touches no ledger balance by
 * itself — a physical asset entering the register and money entering the
 * books are two different facts (D21: "the register is built independently
 * and reconciled, not forced"). What this module guarantees instead is the
 * same thing every other write in the engine guarantees: an audit-logged,
 * single-transaction write (D30), never a bare `db.query.insert(...)` from a
 * screen.
 */
import { eq } from "drizzle-orm";
import { fixedAsset } from "../../db/schema";
import { statement, type EngineDb } from "./types";
import { InvalidStatusError } from "./errors";
import { auditStatement } from "./audit";
import { nextRowId } from "./ids";
import { annualDepreciationCentavos } from "../depreciation";

export interface RecordFixedAssetInput {
  barangayId: number;
  category: string;
  description: string;
  acquisitionDate: string;
  costCentavos: number;
  usefulLifeYears: number;
  /** Ratio, e.g. 0.10 for 10% — see docs/decisions.md D17. */
  residualRate: number;
  /** The Revised Chart of Accounts asset account this rolls up to (D20) — nullable, since the client's legacy-code mapping is still being confirmed. */
  accountId?: number;
  /** The client's own FA-schedule numbering, kept for tracing (D20). */
  legacyCode?: string;
  recordedBy: number;
}

/**
 * Adds a fixed asset to the register.
 *
 * Validates the same invariants the schema's own CHECK constraints enforce
 * (`asset_life_positive`, `asset_cost_non_negative`), plus the residual-rate
 * range `annualDepreciationCentavos` already validates — reusing that
 * function here is what confirms the figures this asset will later produce
 * are actually computable, not just acceptable to SQLite.
 */
export async function recordFixedAsset(db: EngineDb, input: RecordFixedAssetInput) {
  if (input.category.trim() === "") throw new InvalidStatusError("An asset needs a category");
  if (input.description.trim() === "") throw new InvalidStatusError("An asset needs a description");
  // Throws on an invalid life/cost/residualRate combination — the same
  // arithmetic this asset will be depreciated with, checked before it is
  // ever written.
  annualDepreciationCentavos(input.costCentavos, input.usefulLifeYears, input.residualRate);

  const id = await nextRowId(db, "fixed_asset");
  const row = {
    id,
    barangayId: input.barangayId,
    category: input.category.trim(),
    description: input.description.trim(),
    acquisitionDate: input.acquisitionDate,
    costCentavos: input.costCentavos,
    usefulLifeYears: input.usefulLifeYears,
    residualRate: String(input.residualRate),
    accountId: input.accountId ?? null,
    legacyCode: input.legacyCode?.trim() || null,
  };

  await db.writeBatch([
    statement(db.query.insert(fixedAsset).values(row)),
    auditStatement(db, input.recordedBy, "fixed_asset.create", "fixed_asset", id, null, row),
  ]);

  return readFixedAsset(db, id);
}

async function readFixedAsset(db: EngineDb, assetId: number) {
  const asset = await db.query.select().from(fixedAsset).where(eq(fixedAsset.id, assetId)).get();
  if (!asset) throw new InvalidStatusError(`Fixed asset ${assetId} does not exist`);
  return asset;
}

export interface DisposeFixedAssetInput {
  assetId: number;
  disposalDate: string;
  disposedBy: number;
}

/** Records an asset's disposal date. Depreciation simply stops accruing past this date (computed, D18) — nothing else about the row changes. */
export async function disposeFixedAsset(db: EngineDb, input: DisposeFixedAssetInput) {
  const asset = await readFixedAsset(db, input.assetId);
  if (asset.disposalDate) {
    throw new InvalidStatusError(`This asset was already disposed on ${asset.disposalDate}`);
  }
  if (input.disposalDate < asset.acquisitionDate) {
    throw new InvalidStatusError("The disposal date cannot be earlier than the acquisition date");
  }

  const disposed = { disposalDate: input.disposalDate };

  await db.writeBatch([
    statement(db.query.update(fixedAsset).set(disposed).where(eq(fixedAsset.id, input.assetId))),
    auditStatement(db, input.disposedBy, "fixed_asset.dispose", "fixed_asset", input.assetId, asset, {
      ...asset,
      ...disposed,
    }),
  ]);

  return readFixedAsset(db, input.assetId);
}
