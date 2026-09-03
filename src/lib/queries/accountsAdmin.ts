/**
 * The chart of accounts, as the admin screen needs it: every account (D9 —
 * one shared chart, no barangay scoping), and the two actions a screen can
 * take. Same seam pattern as `queries/fixedAssets.ts` — the engine
 * (`engine/accountsAdmin.ts`) owns each write and its audit trail; this
 * module resolves the actor and shapes the list for the screen.
 */
import { asc } from "drizzle-orm";
import { account, type AccountType, type NormalBalance } from "../../db/schema";
import { resolveProvisionalCode, setAccountActive } from "../engine/accountsAdmin";
import type { EngineDb } from "../engine/types";

export interface AdminAccountRecord {
  id: number;
  code: string;
  name: string;
  accountType: AccountType;
  normalBalance: NormalBalance;
  isPostable: boolean;
  isActive: boolean;
  isProvisionalCode: boolean;
}

/** Every account in the one shared chart (D9), ordered by code. */
export async function listAllAccounts(db: EngineDb): Promise<AdminAccountRecord[]> {
  return db.query.select().from(account).orderBy(asc(account.code)).all();
}

export interface ResolveProvisionalCodeActionInput {
  accountId: number;
  newCode: string;
}

/**
 * Confirms an account's real code (D12). `actorUserId` is the current
 * session's user (T-018/D24) — restricted to Administrators at the screen
 * level (`ChartOfAccountsAdmin.tsx` is only reachable as one), the same
 * way every other "requires an admin" rule in this app is enforced today.
 */
export async function resolveProvisionalCodeAction(
  db: EngineDb,
  input: ResolveProvisionalCodeActionInput,
  actorUserId: number,
): Promise<AdminAccountRecord> {
  return resolveProvisionalCode(db, { ...input, resolvedBy: actorUserId });
}

export interface SetAccountActiveActionInput {
  accountId: number;
  isActive: boolean;
}

/** Activates or deactivates an account for the voucher dropdowns (D10). `actorUserId` is the current session's user (T-018/D24), Administrator-only at the screen level. */
export async function setAccountActiveAction(
  db: EngineDb,
  input: SetAccountActiveActionInput,
  actorUserId: number,
): Promise<AdminAccountRecord> {
  return setAccountActive(db, { ...input, changedBy: actorUserId });
}
