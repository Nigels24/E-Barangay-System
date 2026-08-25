/**
 * Chart-of-accounts administration (D9-D12): confirming a provisional
 * account code, and activating/deactivating an account for the voucher
 * dropdowns.
 *
 * **What this deliberately does NOT do:** add new accounts, or load the
 * rest of the standard Revised Chart of Accounts. D10 calls for shipping
 * the full RCA and hiding what's unused, but the full RCA has never been
 * seeded — only the 46 accounts independently verified against the
 * client's real 2023 trial balance are (see `db/seed/accounts.ts`'s own
 * comment: loading the rest needs an authoritative digital copy of the COA
 * circular, deliberately not reconstructed from memory). This module is
 * the administrative *capability* D10/D12 call for, ready for whichever of
 * those two facts the client supplies first — it does not itself depend on
 * either.
 *
 * Same audit-logged, single-transaction write every other engine module
 * uses (D30).
 */
import { eq } from "drizzle-orm";
import { account } from "../../db/schema";
import { statement, type EngineDb } from "./types";
import { InvalidStatusError } from "./errors";
import { auditStatement } from "./audit";

async function readAccount(db: EngineDb, accountId: number) {
  const row = await db.query.select().from(account).where(eq(account.id, accountId)).get();
  if (!row) throw new InvalidStatusError(`Account ${accountId} does not exist`);
  return row;
}

export interface ResolveProvisionalCodeInput {
  accountId: number;
  /** The real code the City Accountant has confirmed (D12). */
  newCode: string;
  resolvedBy: number;
}

/**
 * Replaces a placeholder code with the real, confirmed one, and clears
 * `isProvisionalCode` — the one thing that lets a report builder stop
 * refusing to print a line that touches this account. One-way: once
 * confirmed, this action refuses to run again on the same account, the
 * same "nothing is silently rewritten twice" shape every other terminal
 * action in this app follows (void, dispose, finalize).
 */
export async function resolveProvisionalCode(db: EngineDb, input: ResolveProvisionalCodeInput) {
  const acct = await readAccount(db, input.accountId);
  if (!acct.isProvisionalCode) {
    throw new InvalidStatusError("This account's code is already confirmed");
  }
  if (input.newCode.trim() === "") {
    throw new InvalidStatusError("Give the confirmed account code");
  }

  const updated = { code: input.newCode.trim(), isProvisionalCode: false };

  await db.writeBatch([
    statement(db.query.update(account).set(updated).where(eq(account.id, input.accountId))),
    auditStatement(db, input.resolvedBy, "account.resolve_provisional_code", "account", input.accountId, acct, {
      ...acct,
      ...updated,
    }),
  ]);

  return readAccount(db, input.accountId);
}

export interface SetAccountActiveInput {
  accountId: number;
  isActive: boolean;
  changedBy: number;
}

/**
 * Activates or deactivates an account for the voucher dropdowns (D10).
 * Never touches historical data — reports read every posted line
 * regardless of `isActive` (see `reports/trialBalance.ts`); this only
 * changes what `listPostableAccounts` offers a *new* voucher line.
 */
export async function setAccountActive(db: EngineDb, input: SetAccountActiveInput) {
  const acct = await readAccount(db, input.accountId);
  if (acct.isActive === input.isActive) {
    throw new InvalidStatusError(`This account is already ${input.isActive ? "active" : "inactive"}`);
  }

  const updated = { isActive: input.isActive };

  await db.writeBatch([
    statement(db.query.update(account).set(updated).where(eq(account.id, input.accountId))),
    auditStatement(db, input.changedBy, "account.set_active", "account", input.accountId, acct, {
      ...acct,
      ...updated,
    }),
  ]);

  return readAccount(db, input.accountId);
}
