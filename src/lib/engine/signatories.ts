/**
 * Report signatories (D25): who signs a printed report, per barangay and
 * per role, effective from a given date. Officials change over the years
 * this system will run, so a new officer is a new row, never an edit to an
 * existing one — the same "nothing is silently rewritten" rule every other
 * register in this app follows. A report resolves which row is current for
 * it (`reports/signatories.ts`'s `getEffectiveSignatories`); this module
 * only ever adds.
 *
 * Same audit-logged, single-transaction write every other engine module
 * uses (D30).
 */
import { eq } from "drizzle-orm";
import { signatory, type SignatoryRole } from "../../db/schema";
import { statement, type EngineDb } from "./types";
import { InvalidStatusError } from "./errors";
import { auditStatement } from "./audit";
import { nextRowId } from "./ids";

const VALID_ROLES: readonly SignatoryRole[] = ["prepared_by", "certified_by", "approved_by"];

export interface RecordSignatoryInput {
  barangayId: number;
  role: SignatoryRole;
  name: string;
  designation: string;
  effectiveFrom: string;
  recordedBy: number;
}

export async function recordSignatory(db: EngineDb, input: RecordSignatoryInput) {
  if (!VALID_ROLES.includes(input.role)) {
    throw new InvalidStatusError(`"${input.role}" is not a signatory role`);
  }
  if (input.name.trim() === "") throw new InvalidStatusError("A signatory needs a name");
  if (input.designation.trim() === "") throw new InvalidStatusError("A signatory needs a designation");
  if (input.effectiveFrom.trim() === "") throw new InvalidStatusError("A signatory needs an effective date");

  const id = await nextRowId(db, "signatory");
  const row = {
    id,
    barangayId: input.barangayId,
    role: input.role,
    name: input.name.trim(),
    designation: input.designation.trim(),
    effectiveFrom: input.effectiveFrom,
  };

  await db.writeBatch([
    statement(db.query.insert(signatory).values(row)),
    auditStatement(db, input.recordedBy, "signatory.create", "signatory", id, null, row),
  ]);

  return readSignatory(db, id);
}

async function readSignatory(db: EngineDb, signatoryId: number) {
  const row = await db.query.select().from(signatory).where(eq(signatory.id, signatoryId)).get();
  if (!row) throw new InvalidStatusError(`Signatory ${signatoryId} does not exist`);
  return row;
}
