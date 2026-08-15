import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { createTestDb } from "../../testDb";
import { appUser } from "../../schema";
import { PLACEHOLDER_USER_USERNAME, seedPlaceholderUser } from "../users";

describe("seedPlaceholderUser", () => {
  it("inserts one bookkeeper the ledger can attribute writes to", async () => {
    const db = createTestDb();
    const inserted = await seedPlaceholderUser(db);

    expect(inserted).toHaveLength(1);
    const rows = await db.query.select().from(appUser).all();
    expect(rows).toHaveLength(1);
    expect(rows[0].username).toBe(PLACEHOLDER_USER_USERNAME);
    expect(rows[0].role).toBe("bookkeeper");
    expect(rows[0].isActive).toBe(true);
  });

  it("does not duplicate on a second run", async () => {
    const db = createTestDb();
    await seedPlaceholderUser(db);
    expect(await seedPlaceholderUser(db)).toHaveLength(0);
    expect(await db.query.select().from(appUser).all()).toHaveLength(1);
  });

  it("leaves a password no verifier can ever match", async () => {
    const db = createTestDb();
    await seedPlaceholderUser(db);
    const row = await db.query
      .select()
      .from(appUser)
      .where(eq(appUser.username, PLACEHOLDER_USER_USERNAME))
      .get();

    // Not a hash of anything — this account must not become a way in when
    // login arrives in Phase 5 (D32).
    expect(row?.passwordHash).toBe("!");
    expect(row?.fullName.toLowerCase()).toContain("placeholder");
  });

  it("adds itself to a database that already has real users, without touching them", async () => {
    const db = createTestDb();
    await db.query
      .insert(appUser)
      .values({ username: "ecmanosur", passwordHash: "argon2$real", fullName: "Eugenie Manosur", role: "admin" })
      .run();

    await seedPlaceholderUser(db);

    const rows = await db.query.select().from(appUser).all();
    expect(rows).toHaveLength(2);
    expect(rows.find((r) => r.username === "ecmanosur")?.passwordHash).toBe("argon2$real");
  });
});
