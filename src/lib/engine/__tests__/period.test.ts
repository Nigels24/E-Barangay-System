import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "./fixtures";
import { ensurePeriod, closePeriod, reopenPeriod } from "../period";
import { InvalidStatusError } from "../errors";
import { auditLog, barangay as barangayTable } from "../../../db/schema";
import { eq } from "drizzle-orm";

describe("ensurePeriod", () => {
  it("opens a period on demand and returns the same row on repeat calls", async () => {
    const { db, barangay } = await seedEngineFixture();
    const first = await ensurePeriod(db, barangay.id, 2019, 6);
    const second = await ensurePeriod(db, barangay.id, 2019, 6);
    expect(first.id).toBe(second.id);
    expect(first.status).toBe("open");
  });

  it("opens years far in the past and far ahead of the current year — no fixed year list", async () => {
    const { db, barangay } = await seedEngineFixture();
    // The client's own Schedule of Advances runs back to the year 2000.
    expect((await ensurePeriod(db, barangay.id, 2000, 4)).year).toBe(2000);
    expect((await ensurePeriod(db, barangay.id, 2031, 1)).year).toBe(2031);
  });

  it("closing one barangay's period never touches another barangay's period", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const otherBarangay = await db.query
      .insert(barangayTable)
      .values({ code: "TEST-OTHER", name: "Barangay Test Other" })
      .returning()
      .get();
    const periodA = await ensurePeriod(db, barangay.id, 2024, 3);
    await ensurePeriod(db, otherBarangay.id, 2024, 3);
    await closePeriod(db, periodA.id, admin.id);
    expect((await ensurePeriod(db, barangay.id, 2024, 3)).status).toBe("closed");
    expect((await ensurePeriod(db, otherBarangay.id, 2024, 3)).status).toBe("open");
  });
});

describe("closePeriod", () => {
  it("closes an open period and records who closed it", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const period = await ensurePeriod(db, barangay.id, 2024, 4);
    const closed = await closePeriod(db, period.id, admin.id);
    expect(closed.status).toBe("closed");
    expect(closed.closedBy).toBe(admin.id);
    expect(closed.closedAt).toBeTruthy();
  });

  it("refuses to close an already-closed period", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const period = await ensurePeriod(db, barangay.id, 2024, 4);
    await closePeriod(db, period.id, admin.id);
    await expect(closePeriod(db, period.id, admin.id)).rejects.toThrow(InvalidStatusError);
  });

  it("writes an audit log entry on close", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const period = await ensurePeriod(db, barangay.id, 2024, 4);
    await closePeriod(db, period.id, admin.id);
    const logs = await db.query.select().from(auditLog).where(eq(auditLog.action, "period.close")).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].recordId).toBe(period.id);
  });
});

describe("reopenPeriod", () => {
  it("reopens a closed period given a reason", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const period = await ensurePeriod(db, barangay.id, 2024, 5);
    await closePeriod(db, period.id, admin.id);
    const reopened = await reopenPeriod(db, period.id, admin.id, "Late correction requested by City Accountant");
    expect(reopened.status).toBe("open");
    expect(reopened.closedAt).toBeNull();
  });

  it("refuses to reopen without a reason", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const period = await ensurePeriod(db, barangay.id, 2024, 5);
    await closePeriod(db, period.id, admin.id);
    await expect(reopenPeriod(db, period.id, admin.id, "")).rejects.toThrow(InvalidStatusError);
    await expect(reopenPeriod(db, period.id, admin.id, "   ")).rejects.toThrow(InvalidStatusError);
  });

  it("refuses to reopen a period that isn't closed", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const period = await ensurePeriod(db, barangay.id, 2024, 5);
    await expect(reopenPeriod(db, period.id, admin.id, "Some reason")).rejects.toThrow(InvalidStatusError);
  });

  it("records the reopen reason in the audit trail", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const period = await ensurePeriod(db, barangay.id, 2024, 5);
    await closePeriod(db, period.id, admin.id);
    await reopenPeriod(db, period.id, admin.id, "Late correction requested by City Accountant");
    const logs = await db.query.select().from(auditLog).where(eq(auditLog.action, "period.reopen")).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].afterJson).toContain("Late correction requested by City Accountant");
  });
});
