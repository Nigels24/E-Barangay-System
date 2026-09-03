/**
 * Real users (D24/T-018): creating one, and activating/deactivating one.
 *
 * Login in this app is a name/role picker, never a password (see
 * schema.ts's own comment on `app_user.passwordHash`) — one shared office
 * PC, and a password checked against nobody in particular buys no real
 * security. What this module guarantees is the same thing every other
 * write in the engine guarantees: an audit-logged, single-transaction
 * write (D30).
 *
 * **The bootstrap problem, and how it's resolved:** every other write in
 * this app is audit-logged against an actor who already exists — but the
 * very first user has nobody to be created *by*. `createUser()` handles
 * this the same way a fixed asset's disposal audit-logs against the actor
 * disposing it: the new user's id is allocated before the write batch is
 * built (`nextRowId`, same as every other engine write), and when no
 * `createdBy` is given, that new id is used as its own audit actor — the
 * first administrator's account is recorded as having been created by
 * itself, which is exactly what happened. Every user after the first is
 * created by a real, already-selected actor, same as any other write.
 */
import { and, eq, ne } from "drizzle-orm";
import { appUser, type UserRole } from "../../db/schema";
import { statement, type EngineDb } from "./types";
import { InvalidStatusError } from "./errors";
import { auditStatement } from "./audit";
import { nextRowId } from "./ids";

const VALID_ROLES: readonly UserRole[] = ["admin", "bookkeeper", "reviewer"];

async function readUser(db: EngineDb, userId: number) {
  const row = await db.query.select().from(appUser).where(eq(appUser.id, userId)).get();
  if (!row) throw new InvalidStatusError(`User ${userId} does not exist`);
  return row;
}

export interface CreateUserInput {
  username: string;
  fullName: string;
  position?: string;
  role: UserRole;
  /** Omit only for the very first user — see the module doc. */
  createdBy?: number;
}

export async function createUser(db: EngineDb, input: CreateUserInput) {
  if (!VALID_ROLES.includes(input.role)) {
    throw new InvalidStatusError(`"${input.role}" is not a user role`);
  }
  if (input.username.trim() === "") throw new InvalidStatusError("A user needs a username");
  if (input.fullName.trim() === "") throw new InvalidStatusError("A user needs a full name");

  const id = await nextRowId(db, "app_user");
  const row = {
    id,
    username: input.username.trim(),
    passwordHash: null,
    fullName: input.fullName.trim(),
    position: input.position?.trim() || null,
    role: input.role,
    isActive: true,
  };
  const actorId = input.createdBy ?? id;

  await db.writeBatch([
    statement(db.query.insert(appUser).values(row)),
    auditStatement(db, actorId, "app_user.create", "app_user", id, null, row),
  ]);

  return readUser(db, id);
}

export interface SetUserActiveInput {
  userId: number;
  isActive: boolean;
  changedBy: number;
}

/**
 * Activates or deactivates a user. Refuses to deactivate the last active
 * administrator — locking every admin out of user management and the
 * chart of accounts has no recovery path short of editing the database
 * directly, so this is a hard stop, not a warning.
 */
export async function setUserActive(db: EngineDb, input: SetUserActiveInput) {
  const user = await readUser(db, input.userId);
  if (user.isActive === input.isActive) {
    throw new InvalidStatusError(`This user is already ${input.isActive ? "active" : "inactive"}`);
  }

  if (!input.isActive && user.role === "admin") {
    const otherActiveAdmins = await db.query
      .select({ id: appUser.id })
      .from(appUser)
      .where(and(eq(appUser.role, "admin"), eq(appUser.isActive, true), ne(appUser.id, user.id)))
      .all();
    if (otherActiveAdmins.length === 0) {
      throw new InvalidStatusError("Cannot deactivate the last active administrator");
    }
  }

  const updated = { isActive: input.isActive };

  await db.writeBatch([
    statement(db.query.update(appUser).set(updated).where(eq(appUser.id, input.userId))),
    auditStatement(db, input.changedBy, "app_user.set_active", "app_user", input.userId, user, {
      ...user,
      ...updated,
    }),
  ]);

  return readUser(db, input.userId);
}
