import { describe, it, expect } from "vitest";
import { seedEngineFixture } from "./fixtures";
import { liquidateAdvance, recordAdvance } from "../advances";
import { createDraftEntry, postEntry } from "../post";
import { InvalidStatusError } from "../errors";
import { auditLog } from "../../../db/schema";
import { eq } from "drizzle-orm";
import { toCentavos } from "../../money";

describe("recordAdvance", () => {
  it("grants an advance and audit-logs the write", async () => {
    const { db, barangay, admin } = await seedEngineFixture();

    const advance = await recordAdvance(db, {
      barangayId: barangay.id,
      dateGranted: "2026-03-10",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance for a Manila conference",
      amountCentavos: toCentavos(15000),
      recordedBy: admin.id,
    });

    expect(advance.id).toBeGreaterThan(0);
    expect(advance.payee).toBe("Juan Dela Cruz");
    expect(advance.amountCentavos).toBe(toCentavos(15000));
    expect(advance.liquidatedCentavos).toBe(0);
    expect(advance.status).toBe("outstanding");
    expect(advance.sourceEntryId).toBeNull();

    const audit = await db.query.select().from(auditLog).where(eq(auditLog.tableName, "advance_to_officer")).all();
    expect(audit).toHaveLength(1);
    expect(audit[0].action).toBe("advance_to_officer.create");
    expect(audit[0].userId).toBe(admin.id);
  });

  it("keeps an optional sourceEntryId for tracing to the voucher that disbursed the cash", async () => {
    const { db, barangay, admin, accounts, periods } = await seedEngineFixture();
    const draft = await createDraftEntry(db, {
      barangayId: barangay.id,
      periodId: periods.jan2024.id,
      entryDate: "2024-01-10",
      book: "CDJ",
      particulars: "Cash advance disbursed",
      createdBy: admin.id,
      lines: [
        { accountId: accounts.cashInBank.id, side: "credit", amountCentavos: toCentavos(15000) },
        { accountId: accounts.equity.id, side: "debit", amountCentavos: toCentavos(15000) },
      ],
    });
    const posted = await postEntry(db, { entryId: draft.id, postedBy: admin.id });

    const advance = await recordAdvance(db, {
      barangayId: barangay.id,
      dateGranted: "2024-01-10",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance",
      amountCentavos: toCentavos(15000),
      sourceEntryId: posted.id,
      recordedBy: admin.id,
    });
    expect(advance.sourceEntryId).toBe(posted.id);
  });

  it("refuses a blank payee or particulars", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const base = {
      barangayId: barangay.id,
      dateGranted: "2026-03-10",
      amountCentavos: toCentavos(1000),
      recordedBy: admin.id,
    };
    await expect(recordAdvance(db, { ...base, payee: "  ", particulars: "Something" })).rejects.toThrow(
      InvalidStatusError,
    );
    await expect(recordAdvance(db, { ...base, payee: "Juan Dela Cruz", particulars: "" })).rejects.toThrow(
      InvalidStatusError,
    );
  });

  it("refuses a zero or negative amount", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const base = {
      barangayId: barangay.id,
      dateGranted: "2026-03-10",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance",
      recordedBy: admin.id,
    };
    await expect(recordAdvance(db, { ...base, amountCentavos: 0 })).rejects.toThrow(InvalidStatusError);
    await expect(recordAdvance(db, { ...base, amountCentavos: -toCentavos(100) })).rejects.toThrow(
      InvalidStatusError,
    );
  });
});

describe("liquidateAdvance", () => {
  async function grantAdvance(db: Awaited<ReturnType<typeof seedEngineFixture>>["db"], barangayId: number, adminId: number) {
    return recordAdvance(db, {
      barangayId,
      dateGranted: "2026-03-10",
      payee: "Juan Dela Cruz",
      particulars: "Travel advance",
      amountCentavos: toCentavos(15000),
      recordedBy: adminId,
    });
  }

  it("liquidates in full and flips status, audit-logging the write", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const advance = await grantAdvance(db, barangay.id, admin.id);

    const liquidated = await liquidateAdvance(db, {
      advanceId: advance.id,
      amountCentavos: toCentavos(15000),
      liquidatedBy: admin.id,
    });
    expect(liquidated.liquidatedCentavos).toBe(toCentavos(15000));
    expect(liquidated.status).toBe("liquidated");

    const audit = await db.query.select().from(auditLog).where(eq(auditLog.tableName, "advance_to_officer")).all();
    expect(audit.some((row) => row.action === "advance_to_officer.liquidate")).toBe(true);
  });

  it("liquidates partially and keeps the advance outstanding", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const advance = await grantAdvance(db, barangay.id, admin.id);

    const liquidated = await liquidateAdvance(db, {
      advanceId: advance.id,
      amountCentavos: toCentavos(5000),
      liquidatedBy: admin.id,
    });
    expect(liquidated.liquidatedCentavos).toBe(toCentavos(5000));
    expect(liquidated.status).toBe("outstanding");
  });

  it("supports multiple partial liquidations that sum exactly to the amount granted", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const advance = await grantAdvance(db, barangay.id, admin.id);

    await liquidateAdvance(db, { advanceId: advance.id, amountCentavos: toCentavos(5000), liquidatedBy: admin.id });
    const final = await liquidateAdvance(db, {
      advanceId: advance.id,
      amountCentavos: toCentavos(10000),
      liquidatedBy: admin.id,
    });
    expect(final.liquidatedCentavos).toBe(toCentavos(15000));
    expect(final.status).toBe("liquidated");
  });

  it("refuses a liquidation that would exceed what's still outstanding", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const advance = await grantAdvance(db, barangay.id, admin.id);

    await expect(
      liquidateAdvance(db, { advanceId: advance.id, amountCentavos: toCentavos(15000.01), liquidatedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses to liquidate an advance already fully liquidated", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const advance = await grantAdvance(db, barangay.id, admin.id);
    await liquidateAdvance(db, { advanceId: advance.id, amountCentavos: toCentavos(15000), liquidatedBy: admin.id });

    await expect(
      liquidateAdvance(db, { advanceId: advance.id, amountCentavos: toCentavos(1), liquidatedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses a zero or negative liquidation amount", async () => {
    const { db, barangay, admin } = await seedEngineFixture();
    const advance = await grantAdvance(db, barangay.id, admin.id);

    await expect(
      liquidateAdvance(db, { advanceId: advance.id, amountCentavos: 0, liquidatedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });

  it("refuses an advance that does not exist", async () => {
    const { db, admin } = await seedEngineFixture();
    await expect(
      liquidateAdvance(db, { advanceId: 999999, amountCentavos: toCentavos(100), liquidatedBy: admin.id }),
    ).rejects.toThrow(InvalidStatusError);
  });
});
