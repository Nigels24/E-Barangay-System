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
import { requirePostingUserId } from "./users";

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

/** Confirms an account's real code (D12). The actor is resolved here (D32). */
export async function resolveProvisionalCodeAction(
  db: EngineDb,
  input: ResolveProvisionalCodeActionInput,
): Promise<AdminAccountRecord> {
  const userId = await requirePostingUserId(db);
  return resolveProvisionalCode(db, { ...input, resolvedBy: userId });
}

export interface SetAccountActiveActionInput {
  accountId: number;
  isActive: boolean;
}

/** Activates or deactivates an account for the voucher dropdowns (D10). The actor is resolved here (D32). */
export async function setAccountActiveAction(
  db: EngineDb,
  input: SetAccountActiveActionInput,
): Promise<AdminAccountRecord> {
  const userId = await requirePostingUserId(db);
  return setAccountActive(db, { ...input, changedBy: userId });
}
