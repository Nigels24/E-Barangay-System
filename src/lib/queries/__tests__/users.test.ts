import { describe, it, expect } from "vitest";
import { createTestDb } from "../../../db/testDb";
import { appUser } from "../../../db/schema";
import { runSeed } from "../../../db/seed";
import { PLACEHOLDER_USER_USERNAME } from "../../../db/seed/users";
import { MissingPostingUserError, requirePostingUserId } from "../users";

describe("requirePostingUserId", () => {
  it("resolves the placeholder user the seed installs", async () => {
    const db = createTestDb();
    await runSeed(db);

    const id = await requirePostingUserId(db);
    const row = await db.query.select().from(appUser).all();
    expect(id).toBe(row.find((r) => r.username === PLACEHOLDER_USER_USERNAME)?.id);
  });

  it("finds it by username, not by assuming it is row 1", async () => {
    const db = createTestDb();
    // A database that already held a real user before this seed existed.
    await db.query
      .insert(appUser)
      .values({ username: "ecmanosur", passwordHash: "argon2$real", fullName: "Eugenie Manosur", role: "admin" })
      .run();
    await runSeed(db);

    const id = await requirePostingUserId(db);
    expect(id).not.toBe(1);
  });

  it("refuses with an actionable message when there is nobody to post as", async () => {
    const db = createTestDb();
    await expect(requirePostingUserId(db)).rejects.toThrow(MissingPostingUserError);
    await expect(requirePostingUserId(db)).rejects.toThrow(/nothing can be posted/);
  });
});
