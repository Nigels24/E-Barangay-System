/**
 * The chart of accounts, as a voucher line's dropdown needs it.
 *
 * Same pattern as `barangays.ts`: a plain async function over `EngineDb`, so
 * the query the desktop app issues is the query the test suite proves.
 */
import { and, asc, eq } from "drizzle-orm";
import { account } from "../../db/schema";
import type { EngineDb } from "../engine/types";

/** Just enough of an account to populate a picker and label a ledger row. */
export interface AccountOption {
  id: number;
  code: string;
  name: string;
  /** True when `code` is a placeholder awaiting the City Accountant (D12). */
  isProvisionalCode: boolean;
}

/**
 * Every account a line may be posted to, ordered by code.
 *
 * Two filters, and both are rules rather than tidying:
 *
 *   - `isActive` — D10. The full Revised Chart of Accounts ships, but a
 *     dropdown shows only what the barangay actually uses, so the bookkeeper
 *     scrolls a short list; an administrator activates more without a code
 *     change. (All 46 seeded accounts are active today, so this filter looks
 *     like a no-op — it is not, it is the reason the seed can grow.)
 *   - `isPostable` — a non-postable account is a group header that exists to
 *     roll leaf accounts up on a report. Posting to one would put money in a
 *     place no report reads from.
 *
 * Ordered by code, not by name: a bookkeeper reads this chart by its numbers,
 * and code order is also account-type order (1- assets, 5- expenses).
 */
export async function listPostableAccounts(db: EngineDb): Promise<AccountOption[]> {
  return db.query
    .select({
      id: account.id,
      code: account.code,
      name: account.name,
      isProvisionalCode: account.isProvisionalCode,
    })
    .from(account)
    .where(and(eq(account.isActive, true), eq(account.isPostable, true)))
    .orderBy(asc(account.code))
    .all();
}

/** "1-01-02-010 — Cash in Bank", the label used in the dropdown and the table. */
export function accountLabel(option: Pick<AccountOption, "code" | "name">): string {
  return `${option.code} — ${option.name}`;
}
