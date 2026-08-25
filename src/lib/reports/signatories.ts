/**
 * Which signatory is current for a report, per role, as of a date (D25).
 *
 * `signatory` holds every officer who has ever held a role, each with the
 * date they became effective — a new officer is a new row, never an edit
 * (see `engine/signatories.ts`). A report resolves this the same way payroll
 * or any other effective-dated record does: for each role, the row with the
 * latest `effectiveFrom` that is not after the report's own date. No row for
 * a role, or every row still in the future relative to the report date,
 * means no signatory yet — and per D25, that is a **blank signature line**,
 * never an invented name or a placeholder like "TBD".
 */
import { and, eq, lte } from "drizzle-orm";
import { signatory, type SignatoryRole } from "../../db/schema";
import type { EngineDb } from "../engine/types";

export interface EffectiveSignatory {
  name: string;
  designation: string;
  effectiveFrom: string;
}

/** One entry per role; `null` means no signatory is on file as of this date. */
export type EffectiveSignatories = Record<SignatoryRole, EffectiveSignatory | null>;

const ROLES: readonly SignatoryRole[] = ["prepared_by", "certified_by", "approved_by"];

export async function getEffectiveSignatories(
  db: EngineDb,
  barangayId: number,
  asOfDate: string,
): Promise<EffectiveSignatories> {
  const rows = await db.query
    .select()
    .from(signatory)
    .where(and(eq(signatory.barangayId, barangayId), lte(signatory.effectiveFrom, asOfDate)))
    .all();

  const result = {} as EffectiveSignatories;
  for (const role of ROLES) {
    const forRole = rows.filter((r) => r.role === role);
    const current = forRole.sort(
      (a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom) || a.id - b.id,
    )[forRole.length - 1];
    result[role] = current ? { name: current.name, designation: current.designation, effectiveFrom: current.effectiveFrom } : null;
  }
  return result;
}
