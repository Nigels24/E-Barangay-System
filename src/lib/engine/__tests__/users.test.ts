import { describe, it, expect } from "vitest";
import { createTestDb } from "../../../db/testDb";
import { createUser, setUserActive } from "../users";
import { InvalidStatusError } from "../errors";
import { auditLog } from "../../../db/schema";
import { eq } from "drizzle-orm";

describe("createUser", () => {
  it("creates the first user self-attributed (no createdBy given) and audit-logs it", async () => {
    const db = createTestDb();

    const first = await createUser(db, {
      username: "jdelacruz",
      fullName: "Juan Dela Cruz",
      position: "City Accounting Office",
      role: "admin",
    });

    expect(first.id).toBeGreaterThan(0);
    expect(first.passwordHash).toBeNull();
    expect(first.isActive).toBe(true);

    const audit = await db.query.select().from(auditLog).where(eq(auditLog.tableName, "app_user")).all();
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("app_user.create");
    // Self-attributed: the actor recorded is the very user just created.
    expect(audit[0].userId).toBe(first.id);
  });

  it("creates a second user attributed to a real existing actor", async () => {
    const db = createTestDb();
    const admin = await createUser(db, { username: "admin1", fullName: "Admin One", role: "admin" });

    const second = await createUser(db, {
      username: "bookkeeper1",
      fullName: "Maria Santos",
      role: "bookkeeper",
      createdBy: admin.id,
    });

    const audit = await db.query
      .select()
      .from(auditLog)
      .where(eq(auditLog.tableName, "app_user"))
      .all();
    const secondAudit = audit.find((row) => row.recordId === second.id);
    expect(secondAudit?.userId).toBe(admin.id);
  });

  it("refuses an invalid role", async () => {
    const db = createTestDb();
    await expect(
      createUser(db, { username: "x", fullName: "X", role: "superadmin" as never }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses a blank username or full name", async () => {
    const db = createTestDb();
    await expect(createUser(db, { username: "  ", fullName: "Juan", role: "admin" })).rejects.toThrow(
      InvalidStatusError,
    );
    await expect(createUser(db, { username: "jdelacruz", fullName: "  ", role: "admin" })).rejects.toThrow(
      InvalidStatusError,
    );
  });

  it("refuses a duplicate username (schema's own UNIQUE constraint)", async () => {
    const db = createTestDb();
    await createUser(db, { username: "jdelacruz", fullName: "Juan Dela Cruz", role: "admin" });
    await expect(
      createUser(db, { username: "jdelacruz", fullName: "Someone Else", role: "bookkeeper" }),
    ).rejects.toThrow();
  });
});

describe("setUserActive", () => {
  it("deactivates and reactivates a bookkeeper", async () => {
    const db = createTestDb();
    const admin = await createUser(db, { username: "admin1", fullName: "Admin One", role: "admin" });
    const bookkeeper = await createUser(db, {
      username: "bookkeeper1",
      fullName: "Maria Santos",
      role: "bookkeeper",
      createdBy: admin.id,
    });

    const deactivated = await setUserActive(db, { userId: bookkeeper.id, isActive: false, changedBy: admin.id });
    expect(deactivated.isActive).toBe(false);

    const reactivated = await setUserActive(db, { userId: bookkeeper.id, isActive: true, changedBy: admin.id });
    expect(reactivated.isActive).toBe(true);
  });

  it("refuses a no-op", async () => {
    const db = createTestDb();
    const admin = await createUser(db, { username: "admin1", fullName: "Admin One", role: "admin" });
    await expect(
      setUserActive(db, { userId: admin.id, isActive: true, changedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses to deactivate the last active administrator", async () => {
    const db = createTestDb();
    const admin = await createUser(db, { username: "admin1", fullName: "Admin One", role: "admin" });
    await expect(
      setUserActive(db, { userId: admin.id, isActive: false, changedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("allows deactivating an administrator when another active administrator remains", async () => {
    const db = createTestDb();
    const admin1 = await createUser(db, { username: "admin1", fullName: "Admin One", role: "admin" });
    const admin2 = await createUser(db, {
      username: "admin2",
      fullName: "Admin Two",
      role: "admin",
      createdBy: admin1.id,
    });

    const deactivated = await setUserActive(db, { userId: admin1.id, isActive: false, changedBy: admin2.id });
    expect(deactivated.isActive).toBe(false);
  });

  it("does not block deactivating the last admin if a different admin is already inactive", async () => {
    const db = createTestDb();
    const admin1 = await createUser(db, { username: "admin1", fullName: "Admin One", role: "admin" });
    const admin2 = await createUser(db, {
      username: "admin2",
      fullName: "Admin Two",
      role: "admin",
      createdBy: admin1.id,
    });
    await setUserActive(db, { userId: admin2.id, isActive: false, changedBy: admin1.id });

    // admin1 is now the only active admin — refuse deactivating them too.
    await expect(
      setUserActive(db, { userId: admin1.id, isActive: false, changedBy: admin1.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses a user that does not exist", async () => {
    const db = createTestDb();
    const admin = await createUser(db, { username: "admin1", fullName: "Admin One", role: "admin" });
    await expect(
      setUserActive(db, { userId: 999999, isActive: false, changedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });
});
