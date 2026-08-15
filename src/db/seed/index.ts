import type { EngineDb } from "../../lib/engine/types";
import { seedBarangays } from "./barangays";
import { seedAccounts } from "./accounts";
import { seedPlaceholderUser } from "./users";

export { PENDING_ACCOUNT_CODES, CHART_OF_ACCOUNTS_SEED } from "./accounts";
export { SEED_BARANGAYS } from "./barangays";
export { PLACEHOLDER_USER_USERNAME, PLACEHOLDER_USER_FULL_NAME } from "./users";

/** Applies every seed module. Safe to call on every app startup — nothing here duplicates on a second run. */
export async function runSeed(db: EngineDb) {
  const barangays = await seedBarangays(db);
  const accounts = await seedAccounts(db);
  // Last, and required: without a user row nothing can be written to the
  // ledger at all, because createdBy and the audit log both demand one (D32).
  const users = await seedPlaceholderUser(db);
  return { barangays, accounts, users };
}
