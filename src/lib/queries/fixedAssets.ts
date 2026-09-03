/**
 * The fixed-asset register, as a screen needs it: which accounts an asset
 * may link to, the barangay's own register in table form, and the two
 * actions a screen can take (record an asset, dispose one). Same seam
 * pattern as `journal.ts`/`periods.ts` — the engine (`engine/fixedAssets.ts`)
 * owns the write and the audit trail; this module is what a component calls.
 */
import { and, asc, eq, like, notLike } from "drizzle-orm";
import { account, fixedAsset } from "../../db/schema";
import { disposeFixedAsset, recordFixedAsset } from "../engine/fixedAssets";
import type { EngineDb } from "../engine/types";

/** Just enough of an account to populate the "link to an account" picker. */
export interface FixedAssetAccountOption {
  id: number;
  code: string;
  name: string;
  isProvisionalCode: boolean;
}

/**
 * Active, postable accounts under the Property, Plant and Equipment major
 * group (`1-07-`) — excluding the accumulated-depreciation contra accounts,
 * which an asset never links to directly. There is no dedicated
 * classification column for "this is a depreciable asset account"; `1-07-`
 * is the Revised Chart of Accounts' own PPE prefix, and every accumulated-
 * depreciation account in the seed is named "Accumulated Depreciation - …",
 * so filtering on both is a real rule, not a guess.
 */
export async function listFixedAssetAccounts(db: EngineDb): Promise<FixedAssetAccountOption[]> {
  return db.query
    .select({
      id: account.id,
      code: account.code,
      name: account.name,
      isProvisionalCode: account.isProvisionalCode,
    })
    .from(account)
    .where(
      and(
        eq(account.isActive, true),
        eq(account.isPostable, true),
        eq(account.accountType, "asset"),
        like(account.code, "1-07-%"),
        notLike(account.name, "Accumulated Depreciation%"),
      ),
    )
    .orderBy(asc(account.code))
    .all();
}

/** One asset in the register, joined to the account it rolls up to (if any). */
export interface FixedAssetRecord {
  id: number;
  barangayId: number;
  category: string;
  description: string;
  acquisitionDate: string;
  costCentavos: number;
  usefulLifeYears: number;
  /** Parsed from the stored text ratio, e.g. 0.10. */
  residualRate: number;
  accountId: number | null;
  accountCode: string | null;
  accountName: string | null;
  /** The client's own FA-schedule numbering (D20), kept for tracing. */
  legacyCode: string | null;
  disposalDate: string | null;
}

const fixedAssetSelection = {
  id: fixedAsset.id,
  barangayId: fixedAsset.barangayId,
  category: fixedAsset.category,
  description: fixedAsset.description,
  acquisitionDate: fixedAsset.acquisitionDate,
  costCentavos: fixedAsset.costCentavos,
  usefulLifeYears: fixedAsset.usefulLifeYears,
  residualRate: fixedAsset.residualRate,
  accountId: fixedAsset.accountId,
  accountCode: account.code,
  accountName: account.name,
  legacyCode: fixedAsset.legacyCode,
  disposalDate: fixedAsset.disposalDate,
} as const;

/** Every asset ever recorded for a barangay, held or disposed — oldest acquisition first. */
export async function listFixedAssets(db: EngineDb, barangayId: number): Promise<FixedAssetRecord[]> {
  const rows = await db.query
    .select(fixedAssetSelection)
    .from(fixedAsset)
    .leftJoin(account, eq(fixedAsset.accountId, account.id))
    .where(eq(fixedAsset.barangayId, barangayId))
    .orderBy(asc(fixedAsset.acquisitionDate), asc(fixedAsset.id))
    .all();

  return rows.map((r) => ({ ...r, residualRate: Number(r.residualRate) }));
}

/** One asset by id, joined the same way {@link listFixedAssets} is — what a write action hands back to a screen. */
async function getFixedAsset(db: EngineDb, assetId: number): Promise<FixedAssetRecord> {
  const row = await db.query
    .select(fixedAssetSelection)
    .from(fixedAsset)
    .leftJoin(account, eq(fixedAsset.accountId, account.id))
    .where(eq(fixedAsset.id, assetId))
    .get();
  if (!row) throw new Error(`Fixed asset ${assetId} does not exist`);
  return { ...row, residualRate: Number(row.residualRate) };
}

export interface NewFixedAssetInput {
  barangayId: number;
  category: string;
  description: string;
  acquisitionDate: string;
  costCentavos: number;
  usefulLifeYears: number;
  residualRate: number;
  accountId?: number;
  legacyCode?: string;
}

/**
 * Adds an asset to the register. `actorUserId` is the current session's
 * user (T-018/D24). Returns the same joined shape {@link listFixedAssets}
 * does, not the engine's bare row, so a screen has one shape to render
 * regardless of whether it just wrote or just read.
 */
export async function createFixedAssetAction(
  db: EngineDb,
  input: NewFixedAssetInput,
  actorUserId: number,
): Promise<FixedAssetRecord> {
  const asset = await recordFixedAsset(db, { ...input, recordedBy: actorUserId });
  return getFixedAsset(db, asset.id);
}

export interface DisposeFixedAssetActionInput {
  assetId: number;
  disposalDate: string;
}

/** Records an asset's disposal. `actorUserId` is the current session's user (T-018/D24). */
export async function disposeFixedAssetAction(
  db: EngineDb,
  input: DisposeFixedAssetActionInput,
  actorUserId: number,
): Promise<FixedAssetRecord> {
  const asset = await disposeFixedAsset(db, { ...input, disposedBy: actorUserId });
  return getFixedAsset(db, asset.id);
}
