/**
 * The one placeholder user, seeded so the app can write anything at all.
 *
 * `journal_entry.createdBy` and `audit_log.userId` are both NOT NULL foreign
 * keys to `app_user`, and until now nothing outside the test fixtures ever
 * inserted a user — which meant a voucher could not be created on the real
 * database at all. Real users and login are Phase 5 work (D24: bookkeeper,
 * reviewer, administrator); this row is the stand-in until then, and every
 * `createdBy` / `postedBy` / audit `userId` the UI writes points at it.
 *
 * See docs/decisions.md D32, including the consequence: until Phase 5 the
 * audit trail attributes every action to one generic actor, which is weaker
 * than COA would want and has to be resolved before go-live.
 */
import { eq } from "drizzle-orm";
import { appUser } from "../schema";
import type { EngineDb } from "../../lib/engine/types";

/**
 * The placeholder's username. Also the lookup key everywhere else — the row's
 * id is whatever SQLite assigned it on first run and must never be assumed to
 * be 1 (a database seeded before this module existed may already hold rows).
 */
export const PLACEHOLDER_USER_USERNAME = "placeholder-bookkeeper";

/**
 * Named so that it is unmistakable on screen and in an exported audit log
 * that no real person is being identified here.
 */
export const PLACEHOLDER_USER_FULL_NAME = "Placeholder Bookkeeper (no login yet)";

/**
 * There is no login screen, no password check, and no hashing code in this
 * app yet. `password_hash` is NOT NULL, so it needs *something* — and the
 * something is deliberately not a hash. No hash function produces "!", so
 * whatever verifier Phase 5 brings, this value cannot match a password;
 * the placeholder therefore cannot become a back door if login lands before
 * anyone remembers to remove it.
 */
const NO_PASSWORD_WILL_MATCH = "!";

/** Inserts the placeholder user if it is not already there. Safe on every startup. */
export async function seedPlaceholderUser(db: EngineDb) {
  const existing = await db.query
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.username, PLACEHOLDER_USER_USERNAME))
    .get();
  if (existing) return [];

  return db.query
    .insert(appUser)
    .values({
      username: PLACEHOLDER_USER_USERNAME,
      passwordHash: NO_PASSWORD_WILL_MATCH,
      fullName: PLACEHOLDER_USER_FULL_NAME,
      position: "Placeholder — pending real users (Phase 5)",
      role: "bookkeeper",
    })
    .returning()
    .all();
}
