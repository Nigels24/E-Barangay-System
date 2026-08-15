/**
 * Who the app writes as.
 *
 * There is no login yet (Phase 5), so this resolves the single placeholder
 * user `runSeed` installs — see `src/db/seed/users.ts` and docs/decisions.md
 * D32. It is a lookup by username rather than a hardcoded `1`, because the id
 * is whatever SQLite handed out on first run.
 *
 * The point of the throw below is that a voucher must never be attributed to
 * a guess. If the row is missing, posting stops with a sentence a person can
 * act on instead of the raw `FOREIGN KEY constraint failed` the insert would
 * otherwise produce three layers down.
 */
import { eq } from "drizzle-orm";
import { appUser } from "../../db/schema";
import { PLACEHOLDER_USER_USERNAME } from "../../db/seed/users";
import type { EngineDb } from "../engine/types";

/** Thrown when there is nobody in `app_user` to record an action against. */
export class MissingPostingUserError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MissingPostingUserError";
  }
}

/**
 * The id every `createdBy`, `postedBy` and audit-log `userId` written by the
 * UI uses, until real users exist.
 */
export async function requirePostingUserId(db: EngineDb): Promise<number> {
  const user = await db.query
    .select({ id: appUser.id })
    .from(appUser)
    .where(eq(appUser.username, PLACEHOLDER_USER_USERNAME))
    .get();

  if (!user) {
    throw new MissingPostingUserError(
      "This database has no user for the books to record entries against, so nothing can be " +
        "posted. It is normally created when the app first starts. Closing and reopening the " +
        "app will create it; if that does not help, the database file may be damaged.",
    );
  }
  return user.id;
}
