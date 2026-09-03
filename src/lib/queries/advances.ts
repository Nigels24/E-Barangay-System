/**
 * The advances-to-officers-and-employees register, as a screen needs it:
 * every advance for a barangay, and the two actions a screen can take (grant
 * an advance, record a liquidation). Same seam pattern as
 * `queries/fixedAssets.ts` — the engine (`engine/advances.ts`) owns the write
 * and the audit trail; this module is what a component calls.
 */
import { asc, eq } from "drizzle-orm";
import { advanceToOfficer, type AdvanceStatus } from "../../db/schema";
import { liquidateAdvance, recordAdvance } from "../engine/advances";
import type { EngineDb } from "../engine/types";

/** One advance in the register, granted or fully/partially liquidated. */
export interface AdvanceRecord {
  id: number;
  barangayId: number;
  dateGranted: string;
  payee: string;
  particulars: string;
  amountCentavos: number;
  liquidatedCentavos: number;
  status: AdvanceStatus;
  sourceEntryId: number | null;
}

/** Every advance ever granted to a barangay, oldest grant first — outstanding and liquidated alike. */
export async function listAdvances(db: EngineDb, barangayId: number): Promise<AdvanceRecord[]> {
  return db.query
    .select()
    .from(advanceToOfficer)
    .where(eq(advanceToOfficer.barangayId, barangayId))
    .orderBy(asc(advanceToOfficer.dateGranted), asc(advanceToOfficer.id))
    .all();
}

/** One advance by id — what a write action hands back to a screen. */
async function getAdvance(db: EngineDb, advanceId: number): Promise<AdvanceRecord> {
  const row = await db.query.select().from(advanceToOfficer).where(eq(advanceToOfficer.id, advanceId)).get();
  if (!row) throw new Error(`Advance ${advanceId} does not exist`);
  return row;
}

export interface NewAdvanceInput {
  barangayId: number;
  dateGranted: string;
  payee: string;
  particulars: string;
  amountCentavos: number;
  sourceEntryId?: number;
}

/** Grants an advance. `actorUserId` is the current session's user (T-018/D24). */
export async function createAdvanceAction(
  db: EngineDb,
  input: NewAdvanceInput,
  actorUserId: number,
): Promise<AdvanceRecord> {
  const advance = await recordAdvance(db, { ...input, recordedBy: actorUserId });
  return getAdvance(db, advance.id);
}

export interface LiquidateAdvanceActionInput {
  advanceId: number;
  amountCentavos: number;
}

/** Records a liquidation, in full or in part. `actorUserId` is the current session's user (T-018/D24). */
export async function liquidateAdvanceAction(
  db: EngineDb,
  input: LiquidateAdvanceActionInput,
  actorUserId: number,
): Promise<AdvanceRecord> {
  const advance = await liquidateAdvance(db, { ...input, liquidatedBy: actorUserId });
  return getAdvance(db, advance.id);
}
