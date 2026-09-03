/**
 * Real users (D24/T-018): who can be picked as "who's working" (the
 * session actor every write attributes to), and the two admin actions —
 * add a user, activate/deactivate one.
 *
 * This is what replaced D32's single placeholder actor. Every screen now
 * carries a `currentUserId` from its own session state (set by the
 * who's-working picker in `App.tsx`) and passes it explicitly into every
 * write action — there is no more implicit "resolve the actor" lookup
 * inside a query function, because there is no longer one true actor to
 * resolve.
 */
import { and, asc, eq, ne } from "drizzle-orm";
import { appUser, type UserRole } from "../../db/schema";
import { PLACEHOLDER_USER_USERNAME } from "../../db/seed/users";
import { createUser, setUserActive } from "../engine/users";
import type { EngineDb } from "../engine/types";

export interface UserRecord {
  id: number;
  username: string;
  fullName: string;
  position: string | null;
  role: UserRole;
  isActive: boolean;
}

/**
 * Users the "who's working" picker offers — active, real people only. The
 * D32 placeholder actor is excluded by name: it is a historical artifact
 * (see `db/seed/users.ts`), never something a real person picks as
 * themselves.
 */
export async function listActiveUsers(db: EngineDb): Promise<UserRecord[]> {
  return db.query
    .select()
    .from(appUser)
    .where(and(eq(appUser.isActive, true), ne(appUser.username, PLACEHOLDER_USER_USERNAME)))
    .orderBy(asc(appUser.fullName))
    .all();
}

/** Every real user, active or not — the admin "manage users" screen. */
export async function listAllUsers(db: EngineDb): Promise<UserRecord[]> {
  return db.query
    .select()
    .from(appUser)
    .where(ne(appUser.username, PLACEHOLDER_USER_USERNAME))
    .orderBy(asc(appUser.role), asc(appUser.fullName))
    .all();
}

export interface NewUserInput {
  username: string;
  fullName: string;
  position?: string;
  role: UserRole;
}

/**
 * Creates the very first real user — always an Administrator, regardless
 * of what a future caller might pass, because nobody else exists yet to
 * grant that role later if this one is wrong. Only ever called by the
 * first-run setup screen, which itself only ever renders when
 * `listActiveUsers` comes back empty.
 */
export async function createFirstUserAction(
  db: EngineDb,
  input: { username: string; fullName: string; position?: string },
): Promise<UserRecord> {
  return createUser(db, { ...input, role: "admin" });
}

/** Adds a user. `createdBy` is the current session's actor (an Administrator, enforced by the screen). */
export async function createUserAction(db: EngineDb, input: NewUserInput, createdBy: number): Promise<UserRecord> {
  return createUser(db, { ...input, createdBy });
}

export interface SetUserActiveActionInput {
  userId: number;
  isActive: boolean;
}

/** Activates or deactivates a user. `changedBy` is the current session's actor. */
export async function setUserActiveAction(
  db: EngineDb,
  input: SetUserActiveActionInput,
  changedBy: number,
): Promise<UserRecord> {
  return setUserActive(db, { ...input, changedBy });
}
