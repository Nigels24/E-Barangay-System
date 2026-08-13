/**
 * The app's startup sequence, and the only way the rest of the app should get
 * a database handle.
 *
 * `createAppDb()` migrates (the four `drizzle/*.sql` files are registered in
 * `src-tauri/src/lib.rs` and applied by the SQL plugin during `Database.load`)
 * and then asserts the schema is really there — see `src/db/guards.ts`. What is
 * left for this file is the one thing `createAppDb()` deliberately does not do:
 * the adapter is a dumb transport, and seeding is not transport, it is a
 * decision about what a fresh set of books contains.
 *
 * `runSeed()` is documented idempotent, so this is safe on every launch: the
 * first run creates 54 barangays and 46 accounts, every run after inserts
 * nothing.
 *
 * ### Why the handle is memoized
 *
 * `Database.load()` connects a **new pool** every time it is called and
 * replaces the previous one under the same URL. Two pools on one file is the
 * exact situation D30 exists to prevent, so the promise is created once per
 * process and shared. Callers can ask for the database as often as they like;
 * the bootstrap runs on the first ask only.
 *
 * Never imported by the test suite, for the same reason `appDb.ts` isn't:
 * `invoke` only exists inside a Tauri window. See IMPLEMENTATION_NOTES.md for
 * what was verified by hand instead.
 */
import { createAppDb } from "./appDb";
import { runSeed } from "./seed";
import type { EngineDb } from "../lib/engine/types";

let appDb: Promise<EngineDb> | undefined;

/** Migrates, guards and seeds the app database on first call; returns the same handle after that. */
export function getAppDb(): Promise<EngineDb> {
  appDb ??= (async () => {
    const db = await createAppDb();
    await runSeed(db);
    return db;
  })();
  return appDb;
}
