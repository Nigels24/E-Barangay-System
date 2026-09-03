import { describe, it, expect } from "vitest";
import { createTestDb } from "../../testDb";
import { appUser } from "../../schema";
import { runSeed } from "../index";
import { CHART_OF_ACCOUNTS_SEED } from "../accounts";
import { SEED_BARANGAYS } from "../barangays";

describe("runSeed", () => {
  it("applies the reference-data seed modules and is safe to call on every app startup", async () => {
    const db = createTestDb();
    const first = await runSeed(db);
    expect(first.barangays).toHaveLength(SEED_BARANGAYS.length);
    expect(first.accounts).toHaveLength(CHART_OF_ACCOUNTS_SEED.length);

    const second = await runSeed(db);
    expect(second.barangays).toHaveLength(0);
    expect(second.accounts).toHaveLength(0);
  });

  it("does not seed a user (T-018) — the app's own first-run setup screen creates the first one", async () => {
    const db = createTestDb();
    await runSeed(db);
    const rows = await db.query.select().from(appUser).all();
    expect(rows).toHaveLength(0);
  });
});
