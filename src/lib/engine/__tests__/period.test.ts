import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "./fixtures";
import { ensurePeriod, closePeriod, reopenPeriod } from "../period";
import { InvalidStatusError } from "../errors";
import { auditLog, barangay as barangayTable } from "../../../db/schema";
import { eq } from "drizzle-orm";

describe("ensurePeriod", () => {
  it("opens a period on demand and returns the same row on repeat calls", () => {
    const { db, barangay } = seedEngineFixture();
    const first = ensurePeriod(db, barangay.id, 2019, 6);
    const second = ensurePeriod(db, barangay.id, 2019, 6);
    expect(first.id).toBe(second.id);
    expect(first.status).toBe("open");
  });

  it("opens years far in the past and far ahead of the current year — no fixed year list", () => {
    const { db, barangay } = seedEngineFixture();
    // The client's own Schedule of Advances runs back to the year 2000.
    expect(ensurePeriod(db, barangay.id, 2000, 4).year).toBe(2000);
    expect(ensurePeriod(db, barangay.id, 2031, 1).year).toBe(2031);
  });

  it("closing one barangay's period never touches another barangay's period", () => {
    const { db, barangay, admin } = seedEngineFixture();
    const otherBarangay = db
      .insert(barangayTable)
      .values({ code: "TEST-OTHER", name: "Barangay Test Other" })
      .returning()
      .get();
    const periodA = ensurePeriod(db, barangay.id, 2024, 3);
    ensurePeriod(db, otherBarangay.id, 2024, 3);
    closePeriod(db, periodA.id, admin.id);
    expect(ensurePeriod(db, barangay.id, 2024, 3).status).toBe("closed");
    expect(ensurePeriod(db, otherBarangay.id, 2024, 3).status).toBe("open");
  });
});

describe("closePeriod", () => {
  it("closes an open period and records who closed it", () => {
    const { db, barangay, admin } = seedEngineFixture();
    const period = ensurePeriod(db, barangay.id, 2024, 4);
    const closed = closePeriod(db, period.id, admin.id);
    expect(closed.status).toBe("closed");
    expect(closed.closedBy).toBe(admin.id);
    expect(closed.closedAt).toBeTruthy();
  });

  it("refuses to close an already-closed period", () => {
    const { db, barangay, admin } = seedEngineFixture();
    const period = ensurePeriod(db, barangay.id, 2024, 4);
    closePeriod(db, period.id, admin.id);
    expect(() => closePeriod(db, period.id, admin.id)).toThrow(InvalidStatusError);
  });

  it("writes an audit log entry on close", () => {
    const { db, barangay, admin } = seedEngineFixture();
    const period = ensurePeriod(db, barangay.id, 2024, 4);
    closePeriod(db, period.id, admin.id);
    const logs = db.select().from(auditLog).where(eq(auditLog.action, "period.close")).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].recordId).toBe(period.id);
  });
});

describe("reopenPeriod", () => {
  it("reopens a closed period given a reason", () => {
    const { db, barangay, admin } = seedEngineFixture();
    const period = ensurePeriod(db, barangay.id, 2024, 5);
    closePeriod(db, period.id, admin.id);
    const reopened = reopenPeriod(db, period.id, admin.id, "Late correction requested by City Accountant");
    expect(reopened.status).toBe("open");
    expect(reopened.closedAt).toBeNull();
  });

  it("refuses to reopen without a reason", () => {
    const { db, barangay, admin } = seedEngineFixture();
    const period = ensurePeriod(db, barangay.id, 2024, 5);
    closePeriod(db, period.id, admin.id);
    expect(() => reopenPeriod(db, period.id, admin.id, "")).toThrow(InvalidStatusError);
    expect(() => reopenPeriod(db, period.id, admin.id, "   ")).toThrow(InvalidStatusError);
  });

  it("refuses to reopen a period that isn't closed", () => {
    const { db, barangay, admin } = seedEngineFixture();
    const period = ensurePeriod(db, barangay.id, 2024, 5);
    expect(() => reopenPeriod(db, period.id, admin.id, "Some reason")).toThrow(InvalidStatusError);
  });

  it("records the reopen reason in the audit trail", () => {
    const { db, barangay, admin } = seedEngineFixture();
    const period = ensurePeriod(db, barangay.id, 2024, 5);
    closePeriod(db, period.id, admin.id);
    reopenPeriod(db, period.id, admin.id, "Late correction requested by City Accountant");
    const logs = db.select().from(auditLog).where(eq(auditLog.action, "period.reopen")).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].afterJson).toContain("Late correction requested by City Accountant");
  });
});
