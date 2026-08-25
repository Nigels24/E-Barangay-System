/**
 * Fixed Assets / Depreciation Schedule — the register `fixed_asset` holds,
 * with depreciation computed as of a date, never stored (D18).
 *
 * Unlike the Trial Balance or General Ledger, this is NOT read from
 * `journal_entry_line` — per D21, "the register is built independently and
 * reconciled, not forced." The register and the ledger are two separate
 * facts about the same assets, and this report makes no assumption about
 * which one is right when they disagree; it surfaces the difference instead
 * (`costVariance` below), leaving the accountant to resolve it.
 *
 * An asset drops off this report once disposed as of the report date — it
 * stops being part of what the barangay currently holds and depreciates,
 * though the row itself is never deleted (see `listFixedAssets` for the
 * full history including disposed assets).
 */
import { and, eq, lte } from "drizzle-orm";
import { account, fixedAsset } from "../../db/schema";
import { periodEndDate } from "../calendar";
import { accumulatedDepreciationCentavos, monthlyDepreciationCentavos, monthsDepreciated } from "../depreciation";
import type { EngineDb } from "../engine/types";
import { sumCentavos } from "../money";
import { buildTrialBalance } from "./trialBalance";

export interface FixedAssetScheduleRow {
  assetId: number;
  category: string;
  description: string;
  acquisitionDate: string;
  costCentavos: number;
  usefulLifeYears: number;
  residualRate: number;
  accountId: number | null;
  accountCode: string | null;
  accountName: string | null;
  legacyCode: string | null;
  monthlyDepreciationCentavos: number;
  accumulatedDepreciationCentavos: number;
  bookValueCentavos: number;
}

export interface FixedAssetCategoryTotal {
  category: string;
  costCentavos: number;
  accumulatedDepreciationCentavos: number;
  bookValueCentavos: number;
}

/**
 * D21's variance report: for each linked account, the register's own summed
 * cost against that account's actual ledger balance as of the same date.
 * Scoped to cost only — the register carries no formal pairing to each
 * account's accumulated-depreciation contra account, so comparing THAT leg
 * would mean guessing the pairing from a naming convention rather than a
 * real link. Cost is exact and well-defined; that gap is intentional, not
 * an oversight — see SYSTEM_FLOW.md.
 */
export interface FixedAssetCostVarianceRow {
  accountId: number;
  accountCode: string;
  accountName: string;
  registerCostCentavos: number;
  ledgerBalanceCentavos: number;
  varianceCentavos: number;
}

export interface FixedAssetScheduleResult {
  asOfDate: string;
  rows: FixedAssetScheduleRow[];
  categoryTotals: FixedAssetCategoryTotal[];
  totalCostCentavos: number;
  totalAccumulatedDepreciationCentavos: number;
  totalBookValueCentavos: number;
  costVariance: FixedAssetCostVarianceRow[];
}

export async function buildFixedAssetSchedule(
  db: EngineDb,
  barangayId: number,
  year: number,
  month: number,
): Promise<FixedAssetScheduleResult> {
  const asOfDate = periodEndDate(year, month);

  const assets = await db.query
    .select({
      id: fixedAsset.id,
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
    })
    .from(fixedAsset)
    .leftJoin(account, eq(fixedAsset.accountId, account.id))
    .where(and(eq(fixedAsset.barangayId, barangayId), lte(fixedAsset.acquisitionDate, asOfDate)))
    .all();

  const held = assets.filter((a) => a.disposalDate === null || a.disposalDate > asOfDate);

  const rows: FixedAssetScheduleRow[] = held
    .map((a) => {
      const residualRate = Number(a.residualRate);
      const monthsElapsed = monthsDepreciated(a.acquisitionDate, asOfDate, a.usefulLifeYears);
      const accumulated = accumulatedDepreciationCentavos(a.costCentavos, a.usefulLifeYears, residualRate, monthsElapsed);
      return {
        assetId: a.id,
        category: a.category,
        description: a.description,
        acquisitionDate: a.acquisitionDate,
        costCentavos: a.costCentavos,
        usefulLifeYears: a.usefulLifeYears,
        residualRate,
        accountId: a.accountId,
        accountCode: a.accountCode,
        accountName: a.accountName,
        legacyCode: a.legacyCode,
        monthlyDepreciationCentavos: monthlyDepreciationCentavos(a.costCentavos, a.usefulLifeYears, residualRate),
        accumulatedDepreciationCentavos: accumulated,
        bookValueCentavos: a.costCentavos - accumulated,
      };
    })
    .sort((x, y) => x.category.localeCompare(y.category) || x.acquisitionDate.localeCompare(y.acquisitionDate));

  const byCategory = new Map<string, FixedAssetCategoryTotal>();
  for (const r of rows) {
    const existing =
      byCategory.get(r.category) ?? { category: r.category, costCentavos: 0, accumulatedDepreciationCentavos: 0, bookValueCentavos: 0 };
    existing.costCentavos += r.costCentavos;
    existing.accumulatedDepreciationCentavos += r.accumulatedDepreciationCentavos;
    existing.bookValueCentavos += r.bookValueCentavos;
    byCategory.set(r.category, existing);
  }
  const categoryTotals = [...byCategory.values()].sort((a, b) => a.category.localeCompare(b.category));

  const trialBalance = await buildTrialBalance(db, barangayId, year, month);
  const byAccountId = new Map<number, { accountId: number; accountCode: string; accountName: string; registerCostCentavos: number }>();
  for (const r of rows) {
    if (r.accountId === null || r.accountCode === null || r.accountName === null) continue;
    const existing =
      byAccountId.get(r.accountId) ?? { accountId: r.accountId, accountCode: r.accountCode, accountName: r.accountName, registerCostCentavos: 0 };
    existing.registerCostCentavos += r.costCentavos;
    byAccountId.set(r.accountId, existing);
  }
  const costVariance: FixedAssetCostVarianceRow[] = [...byAccountId.values()]
    .map((v) => {
      const ledgerRow = trialBalance.rows.find((row) => row.accountId === v.accountId);
      const ledgerBalanceCentavos = ledgerRow ? ledgerRow.debitCentavos - ledgerRow.creditCentavos : 0;
      return { ...v, ledgerBalanceCentavos, varianceCentavos: v.registerCostCentavos - ledgerBalanceCentavos };
    })
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));

  return {
    asOfDate,
    rows,
    categoryTotals,
    totalCostCentavos: sumCentavos(rows.map((r) => r.costCentavos)),
    totalAccumulatedDepreciationCentavos: sumCentavos(rows.map((r) => r.accumulatedDepreciationCentavos)),
    totalBookValueCentavos: sumCentavos(rows.map((r) => r.bookValueCentavos)),
    costVariance,
  };
}
