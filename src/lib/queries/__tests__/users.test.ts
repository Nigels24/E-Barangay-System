import { describe, it, expect } from "vitest";
import { createTestDb } from "../../../db/testDb";
import { seedPlaceholderUser } from "../../../db/seed/users";
import {
  createFirstUserAction,
  createUserAction,
  listActiveUsers,
  listAllUsers,
  setUserActiveAction,
} from "../users";

describe("createFirstUserAction", () => {
  it("creates the first user as an Administrator regardless of what else is on the form", async () => {
    const db = createTestDb();
    const first = await createFirstUserAction(db, { username: "jdelacruz", fullName: "Juan Dela Cruz" });
    expect(first.role).toBe("admin");
    expect(first.isActive).toBe(true);
  });
});

describe("listActiveUsers / listAllUsers", () => {
  it("offers only active users to the who's-working picker", async () => {
    const db = createTestDb();
    const admin = await createFirstUserAction(db, { username: "admin1", fullName: "Admin One" });
    const bookkeeper = await createUserAction(
      db,
      { username: "bookkeeper1", fullName: "Maria Santos", role: "bookkeeper" },
      admin.id,
    );
    await setUserActiveAction(db, { userId: bookkeeper.id, isActive: false }, admin.id);

    const active = await listActiveUsers(db);
    expect(active.map((u) => u.username)).toEqual(["admin1"]);
  });

  it("lists everyone, active or not, for the admin screen", async () => {
    const db = createTestDb();
    const admin = await createFirstUserAction(db, { username: "admin1", fullName: "Admin One" });
    const bookkeeper = await createUserAction(
      db,
      { username: "bookkeeper1", fullName: "Maria Santos", role: "bookkeeper" },
      admin.id,
    );
    await setUserActiveAction(db, { userId: bookkeeper.id, isActive: false }, admin.id);

    const all = await listAllUsers(db);
    expect(all.map((u) => u.username).sort()).toEqual(["admin1", "bookkeeper1"]);
  });

  it("never offers the historical D32 placeholder actor, even if one exists in the database", async () => {
    const db = createTestDb();
    await seedPlaceholderUser(db);
    await createFirstUserAction(db, { username: "jdelacruz", fullName: "Juan Dela Cruz" });

    const active = await listActiveUsers(db);
    const all = await listAllUsers(db);
    expect(active.map((u) => u.username)).not.toContain("placeholder-bookkeeper");
    expect(all.map((u) => u.username)).not.toContain("placeholder-bookkeeper");
  });
});

describe("createUserAction / setUserActiveAction", () => {
  it("adds a user attributed to the current session's actor", async () => {
    const db = createTestDb();
    const admin = await createFirstUserAction(db, { username: "admin1", fullName: "Admin One" });
    const created = await createUserAction(
      db,
      { username: "reviewer1", fullName: "Pedro Reyes", role: "reviewer", position: "Reviewer" },
      admin.id,
    );
    expect(created.role).toBe("reviewer");
    expect(created.position).toBe("Reviewer");
  });

  it("deactivates and reactivates a user", async () => {
    const db = createTestDb();
    const admin = await createFirstUserAction(db, { username: "admin1", fullName: "Admin One" });
    const bookkeeper = await createUserAction(
      db,
      { username: "bookkeeper1", fullName: "Maria Santos", role: "bookkeeper" },
      admin.id,
    );

    const deactivated = await setUserActiveAction(db, { userId: bookkeeper.id, isActive: false }, admin.id);
    expect(deactivated.isActive).toBe(false);

    const reactivated = await setUserActiveAction(db, { userId: bookkeeper.id, isActive: true }, admin.id);
    expect(reactivated.isActive).toBe(true);
  });
});
