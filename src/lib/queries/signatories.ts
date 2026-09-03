/**
 * The signatory register, as a screen needs it: every signatory a barangay
 * has on file, and the one action a screen can take (add one). Same seam
 * pattern as `queries/fixedAssets.ts`/`queries/advances.ts` — the engine
 * (`engine/signatories.ts`) owns the write and the audit trail; this module
 * is what a component calls. Resolving which signatory is *current* for a
 * given report date is a report concern, not a screen one — see
 * `reports/signatories.ts`.
 */
import { asc, eq } from "drizzle-orm";
import { signatory, type SignatoryRole } from "../../db/schema";
import { recordSignatory } from "../engine/signatories";
import type { EngineDb } from "../engine/types";

export interface SignatoryRecord {
  id: number;
  barangayId: number;
  role: SignatoryRole;
  name: string;
  designation: string;
  effectiveFrom: string;
}

/** Every signatory ever recorded for a barangay, by role then effective date, oldest first. */
export async function listSignatories(db: EngineDb, barangayId: number): Promise<SignatoryRecord[]> {
  return db.query
    .select()
    .from(signatory)
    .where(eq(signatory.barangayId, barangayId))
    .orderBy(asc(signatory.role), asc(signatory.effectiveFrom), asc(signatory.id))
    .all();
}

export interface NewSignatoryInput {
  barangayId: number;
  role: SignatoryRole;
  name: string;
  designation: string;
  effectiveFrom: string;
}

/** Adds a signatory. `actorUserId` is the current session's user (T-018/D24). */
export async function createSignatoryAction(
  db: EngineDb,
  input: NewSignatoryInput,
  actorUserId: number,
): Promise<SignatoryRecord> {
  return recordSignatory(db, { ...input, recordedBy: actorUserId });
}
