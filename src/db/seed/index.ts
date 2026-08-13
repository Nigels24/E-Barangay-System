import type { EngineDb } from "../../lib/engine/types";
import { seedBarangays } from "./barangays";
import { seedAccounts } from "./accounts";

export { PENDING_ACCOUNT_CODES, CHART_OF_ACCOUNTS_SEED } from "./accounts";
export { SEED_BARANGAYS } from "./barangays";

/** Applies every seed module. Safe to call on every app startup — nothing here duplicates on a second run. */
export async function runSeed(db: EngineDb) {
  const barangays = await seedBarangays(db);
  const accounts = await seedAccounts(db);
  return { barangays, accounts };
}
