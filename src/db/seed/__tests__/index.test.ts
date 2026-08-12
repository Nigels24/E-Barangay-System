import { describe, it, expect } from "vitest";
import { createTestDb } from "../../testDb";
import { runSeed } from "../index";
import { CHART_OF_ACCOUNTS_SEED } from "../accounts";
import { SEED_BARANGAYS } from "../barangays";

describe("runSeed", () => {
  it("applies both seed modules and is safe to call on every app startup", () => {
    const db = createTestDb();
    const first = runSeed(db);
    expect(first.barangays).toHaveLength(SEED_BARANGAYS.length);
    expect(first.accounts).toHaveLength(CHART_OF_ACCOUNTS_SEED.length);

    const second = runSeed(db);
    expect(second.barangays).toHaveLength(0);
    expect(second.accounts).toHaveLength(0);
  });
});
