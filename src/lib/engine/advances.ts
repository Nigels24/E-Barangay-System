/**
 * The advances-to-officers-and-employees subsidiary ledger: granting a cash
 * advance, and recording its liquidation.
 *
 * Same reasoning as the fixed-asset register (D21): granting an advance
 * touches no ledger balance by itself. The actual cash disbursement is a
 * journal voucher a bookkeeper posts separately, the ordinary way, through
 * the voucher screen; this register is the officer-level detail behind
 * whichever ledger account carries the aggregate "Advances to Officers and
 * Employees" balance. `sourceEntryId` lets a row point back at that voucher
 * for tracing, but nothing here reads or posts a journal entry — built
 * independently, reconciled, not forced.
 *
 * Same audit-logged, single-transaction write every other engine module uses
 * (D30).
 */
import { eq } from "drizzle-orm";
import { advanceToOfficer } from "../../db/schema";
import { statement, type EngineDb } from "./types";
import { InvalidStatusError } from "./errors";
import { auditStatement } from "./audit";
import { nextRowId } from "./ids";
import { formatPeso } from "../money";

export interface RecordAdvanceInput {
  barangayId: number;
  dateGranted: string;
  payee: string;
  particulars: string;
  amountCentavos: number;
  /** The journal entry that posted the actual cash disbursement, if this system posted it. */
  sourceEntryId?: number;
  recordedBy: number;
}

/** Grants an advance — a new row, always outstanding, never pre-liquidated. */
export async function recordAdvance(db: EngineDb, input: RecordAdvanceInput) {
  if (input.payee.trim() === "") throw new InvalidStatusError("An advance needs a payee");
  if (input.particulars.trim() === "") throw new InvalidStatusError("An advance needs particulars");
  if (!Number.isInteger(input.amountCentavos) || input.amountCentavos <= 0) {
    throw new InvalidStatusError("An advance must be for a positive amount");
  }

  const id = await nextRowId(db, "advance_to_officer");
  const row = {
    id,
    barangayId: input.barangayId,
    dateGranted: input.dateGranted,
    payee: input.payee.trim(),
    particulars: input.particulars.trim(),
    amountCentavos: input.amountCentavos,
    liquidatedCentavos: 0,
    status: "outstanding" as const,
    sourceEntryId: input.sourceEntryId ?? null,
  };

  await db.writeBatch([
    statement(db.query.insert(advanceToOfficer).values(row)),
    auditStatement(db, input.recordedBy, "advance_to_officer.create", "advance_to_officer", id, null, row),
  ]);

  return readAdvance(db, id);
}

async function readAdvance(db: EngineDb, advanceId: number) {
  const advance = await db.query.select().from(advanceToOfficer).where(eq(advanceToOfficer.id, advanceId)).get();
  if (!advance) throw new InvalidStatusError(`Advance ${advanceId} does not exist`);
  return advance;
}

export interface LiquidateAdvanceInput {
  advanceId: number;
  amountCentavos: number;
  liquidatedBy: number;
}

/**
 * Records a liquidation against an advance, in full or in part. Most cash
 * advances are liquidated in one submission, but the schema's running
 * `liquidatedCentavos` total (never a stored balance) supports a standing or
 * multi-tranche advance liquidated across several. Status flips to
 * "liquidated" the moment the running total reaches the amount granted,
 * never before.
 */
export async function liquidateAdvance(db: EngineDb, input: LiquidateAdvanceInput) {
  const advance = await readAdvance(db, input.advanceId);
  if (advance.status === "liquidated") {
    throw new InvalidStatusError("This advance is already fully liquidated");
  }
  if (!Number.isInteger(input.amountCentavos) || input.amountCentavos <= 0) {
    throw new InvalidStatusError("A liquidation must be for a positive amount");
  }
  const liquidatedCentavos = advance.liquidatedCentavos + input.amountCentavos;
  if (liquidatedCentavos > advance.amountCentavos) {
    throw new InvalidStatusError(
      `That would liquidate more than the ${formatPeso(advance.amountCentavos - advance.liquidatedCentavos)} still outstanding`,
    );
  }

  const updated = {
    liquidatedCentavos,
    status: liquidatedCentavos === advance.amountCentavos ? ("liquidated" as const) : ("outstanding" as const),
  };

  await db.writeBatch([
    statement(db.query.update(advanceToOfficer).set(updated).where(eq(advanceToOfficer.id, input.advanceId))),
    auditStatement(
      db,
      input.liquidatedBy,
      "advance_to_officer.liquidate",
      "advance_to_officer",
      input.advanceId,
      advance,
      { ...advance, ...updated },
    ),
  ]);

  return readAdvance(db, input.advanceId);
}
