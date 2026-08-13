/**
 * Reads about barangays, for the screens that let someone pick one.
 *
 * ### Why this is a function and not a hook
 *
 * Every read in this app lives in a plain async function that takes an
 * `EngineDb` and returns data — never inside a component. Two reasons, and the
 * second is the one that matters:
 *
 * 1. There is no React testing library in this project and none is being added,
 *    so anything inside a component is verified by eye and nothing else.
 * 2. A function shaped like this runs against the test adapter under vitest,
 *    which means the query the desktop app issues is the same query the suite
 *    proves — the same equivalence that makes the engine's tests worth
 *    anything (see `src/db/adapter.ts`).
 *
 * Components call these and render the result. That is the whole pattern.
 */
import { asc, eq } from "drizzle-orm";
import { barangay } from "../../db/schema";
import type { EngineDb } from "../engine/types";

/** Just enough of a barangay to populate a picker. */
export interface BarangayOption {
  id: number;
  name: string;
}

/**
 * Every active barangay, ordered by name.
 *
 * The seed inserts in PSGC-code order, which is *not* alphabetical (Kawit,
 * Lumbia and Santo Niño were added to Pagadian later and carry higher codes
 * than White Beach), so the ordering here is doing real work rather than
 * restating insertion order.
 *
 * Ordering happens in SQLite under its default BINARY collation. That is byte
 * order, so a name differing only by an accented letter could in principle sort
 * oddly — checked against the real 54: "Barangay Santo Niño" is the only
 * accented name and its `ñ` never decides a comparison, because no other name
 * shares the "Barangay Santo Ni" prefix. If a future barangay list changes
 * that, this is the line to revisit.
 */
export async function listBarangays(db: EngineDb): Promise<BarangayOption[]> {
  return db.query
    .select({ id: barangay.id, name: barangay.name })
    .from(barangay)
    .where(eq(barangay.isActive, true))
    .orderBy(asc(barangay.name))
    .all();
}
