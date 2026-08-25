import { describe, it, expect } from "vitest";
import { newCodeProblems } from "../accountAdminForm";

describe("newCodeProblems", () => {
  it("is empty for a usable, unused code", () => {
    expect(newCodeProblems("4-01-04-010", ["1-01-01-010", "1-01-02-010"])).toEqual([]);
  });

  it("flags a blank code", () => {
    expect(newCodeProblems("  ", [])).toContain("Give the confirmed account code.");
  });

  it("flags a code already used by another account", () => {
    expect(newCodeProblems("1-01-01-010", ["1-01-01-010"])).toContain(
      '"1-01-01-010" is already used by another account.',
    );
  });

  it("flags a code that is itself another placeholder", () => {
    expect(newCodeProblems("PENDING-SOMETHING-ELSE", [])).toContain(
      "A confirmed code can't itself be another placeholder.",
    );
  });

  it("trims before checking", () => {
    expect(newCodeProblems("  4-01-04-010  ", [])).toEqual([]);
  });
});
