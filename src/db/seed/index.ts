import type { EngineDb } from "../../lib/engine/types";
import { seedBarangays } from "./barangays";
import { seedAccounts } from "./accounts";

export { PENDING_ACCOUNT_CODES, CHART_OF_ACCOUNTS_SEED } from "./accounts";
export { SEED_BARANGAYS } from "./barangays";
export { PLACEHOLDER_USER_USERNAME, PLACEHOLDER_USER_FULL_NAME } from "./users";

/**
 * Applies every reference-data seed module. Safe to call on every app
 * startup — nothing here duplicates on a second run.
 *
 * Deliberately does NOT seed a user (T-018/D24): real users now exist, and
 * the app's own first-run setup screen is what creates the first one —
 * `App.tsx` shows that screen whenever `listActiveUsers` comes back empty,
 * which is exactly the state a fresh database is in immediately after
 * this function runs. The old D32 placeholder actor `seedPlaceholderUser`
 * still exists in `./users` and is never called again, but it is not
 * deleted: the real production database already has that exact row, with
 * real `journal_entry`/`audit_log` rows pointing at it by id, and D11
 * forbids relabeling a historical record — the module's own comment is
 * what explains that row to a future reader.
 */
export async function runSeed(db: EngineDb) {
  const barangays = await seedBarangays(db);
  const accounts = await seedAccounts(db);
  return { barangays, accounts };
}
