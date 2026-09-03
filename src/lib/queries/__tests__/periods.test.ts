import { describe, it, expect } from "vitest";
import { eq } from "drizzle-orm";
import { seedEngineFixture } from "../../engine/__tests__/fixtures";
import { closePeriod } from "../../engine/period";
import { InvalidStatusError } from "../../engine/errors";
import { createDraftEntry, postEntry } from "../../engine/post";
import { toCentavos } from "../../money";
import { accountingPeriod, auditLog } from "../../../db/schema";
import {
  countPeriodEntries,
  openPeriodSummary,
  closePeriodAction,
  reopenPeriodAction,
  InvalidPeriodSelectionError,
} from "../periods";

describe("openPeriodSummary", () => {
  it("opens a month that has never existed and reports it empty and open", async () => {
    const { db, barangay } = await seedEngineFixture();
    const summary = await openPeriodSummary(db, barangay.id, 2023, 12);

    expect(summary.year).toBe(2023);
    expect(summary.month).toBe(12);
    expect(summary.barangayId).toBe(barangay.id);
    expect(summary.status).toBe("open");
    expect(summary.entryCount).toBe(0);
  });

  it("returns the same period on a second call instead of creating another", async () => {
    const { db, barangay } = await seedEngineFixture();
    const first = await openPeriodSummary(db, barangay.id, 2023, 12);
    const second = await openPeriodSummary(db, barangay.id, 2023, 12);

    expect(second.periodId).toBe(first.periodId);
    const rows = await db.query.select().from(accountingPeriod).all();
    // The two the fixture opens, plus this one — no duplicate.
    expect(rows).toHaveLength(3);
  });

  it("reports a closed period as closed and does not reopen it", async () => {
    const { db, barangay, admin, periods } = await seedEngineFixture();
    await closePeriod(db, periods.jan2024.id, admin.id);

    const summary = await openPeriodSummary(db, barangay.id, 2024, 1);
    expect(summary.periodId).toBe(periods.jan2024.id);
    expect(summary.status).toBe("closed");
  });

  it("counts the entries already filed under the period", async () => {
    const { db, barangay, user, accounts, periods } = await seedEngineFixture();
    const draft = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Payment of electric bill",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: toCentavos(15931.28) },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(15931.28) },
      ],
    });
    await postEntry(db, { entryId: draft.id, postedBy: user.id });

    expect((await openPeriodSummary(db, barangay.id, 2024, 1)).entryCount).toBe(1);
    // Another barangay's or month's entries are not counted into this one.
    expect((await openPeriodSummary(db, barangay.id, 2024, 2)).entryCount).toBe(0);
  });

  it("refuses a selection the database could never hold, with a readable message", async () => {
    const { db, barangay } = await seedEngineFixture();

    await expect(openPeriodSummary(db, barangay.id, 2024, 13)).rejects.toThrow(
      InvalidPeriodSelectionError,
    );
    await expect(openPeriodSummary(db, barangay.id, 20024, 1)).rejects.toThrow(
      InvalidPeriodSelectionError,
    );
    // What a picker produces when nothing is chosen and the value is parsed.
    await expect(openPeriodSummary(db, Number.NaN, 2024, 1)).rejects.toThrow(
      InvalidPeriodSelectionError,
    );
    await expect(openPeriodSummary(db, barangay.id, 2024, Number.NaN)).rejects.toThrow(
      InvalidPeriodSelectionError,
    );

    // Nothing was written on the way to any of those rejections.
    expect(await db.query.select().from(accountingPeriod).all()).toHaveLength(2);
  });

  it("still opens the far-back and far-ahead years the picker allows", async () => {
    const { db, barangay } = await seedEngineFixture();
    expect((await openPeriodSummary(db, barangay.id, 2000, 4)).year).toBe(2000);
    expect((await openPeriodSummary(db, barangay.id, 2031, 1)).year).toBe(2031);
  });
});

describe("countPeriodEntries", () => {
  it("is zero for a period nothing has been filed under", async () => {
    const { db, periods } = await seedEngineFixture();
    expect(await countPeriodEntries(db, periods.jan2024.id)).toBe(0);
  });

  it("is zero for a period id that does not exist", async () => {
    const { db } = await seedEngineFixture();
    expect(await countPeriodEntries(db, 9999)).toBe(0);
  });

  it("counts a draft that has not been posted yet", async () => {
    const { db, barangay, user, accounts, periods } = await seedEngineFixture();
    await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.feb2024.id,
      entryDate: "2024-02-28",
      book: "GJ",
      particulars: "Payment of office supplies",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: toCentavos(9600) },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(9600) },
      ],
    });
    expect(await countPeriodEntries(db, periods.feb2024.id)).toBe(1);
  });
});

describe("closePeriodAction", () => {
  it("closes an open period and attributes it to whoever closed it (T-018)", async () => {
    const { db, periods, admin } = await seedEngineFixture();
    const summary = await closePeriodAction(db, periods.jan2024.id, admin.id);

    expect(summary.status).toBe("closed");
    expect(summary.periodId).toBe(periods.jan2024.id);

    const logs = await db.query.select().from(auditLog).where(eq(auditLog.action, "period.close")).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(admin.id);
  });

  it("preserves the entry count across the close", async () => {
    const { db, barangay, user, admin, accounts, periods } = await seedEngineFixture();
    const draft = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-31",
      book: "GJ",
      particulars: "Payment of electric bill",
      createdBy: user.id,
      lines: [
        { accountId: accounts.electricity.id, side: "debit", amountCentavos: toCentavos(500) },
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(500) },
      ],
    });
    await postEntry(db, { entryId: draft.id, postedBy: user.id });

    const summary = await closePeriodAction(db, periods.jan2024.id, admin.id);
    expect(summary.entryCount).toBe(1);
  });

  it("passes through the engine's refusal to close an already-closed period", async () => {
    const { db, periods, admin } = await seedEngineFixture();
    await closePeriodAction(db, periods.jan2024.id, admin.id);
    await expect(closePeriodAction(db, periods.jan2024.id, admin.id)).rejects.toThrow(InvalidStatusError);
  });
});

describe("reopenPeriodAction", () => {
  it("reopens a closed period given a reason, round-tripping the status", async () => {
    const { db, periods, admin } = await seedEngineFixture();
    await closePeriodAction(db, periods.jan2024.id, admin.id);

    const summary = await reopenPeriodAction(
      db,
      periods.jan2024.id,
      "Late correction requested by City Accountant",
      admin.id,
    );
    expect(summary.status).toBe("open");
    expect(summary.periodId).toBe(periods.jan2024.id);
  });

  it("attributes the reopen to whoever reopened it and logs the reason (T-018, D22)", async () => {
    const { db, periods, admin } = await seedEngineFixture();
    await closePeriodAction(db, periods.jan2024.id, admin.id);
    await reopenPeriodAction(db, periods.jan2024.id, "Late correction requested by City Accountant", admin.id);

    const logs = await db.query.select().from(auditLog).where(eq(auditLog.action, "period.reopen")).all();
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe(admin.id);
    expect(logs[0].afterJson).toContain("Late correction requested by City Accountant");
  });

  it("passes through the engine's refusal of a blank reason", async () => {
    const { db, periods, admin } = await seedEngineFixture();
    await closePeriodAction(db, periods.jan2024.id, admin.id);

    await expect(reopenPeriodAction(db, periods.jan2024.id, "", admin.id)).rejects.toThrow(InvalidStatusError);
    await expect(reopenPeriodAction(db, periods.jan2024.id, "   ", admin.id)).rejects.toThrow(InvalidStatusError);

    // Still closed — the refused attempts wrote nothing.
    const row = await db.query.select().from(accountingPeriod).where(eq(accountingPeriod.id, periods.jan2024.id)).get();
    expect(row?.status).toBe("closed");
  });
});
