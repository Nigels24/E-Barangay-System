import { describe, it, expect } from "vitest";
import { errorMessage } from "../errorMessage";
import { SchemaMissingError } from "../../db/guards";

describe("errorMessage", () => {
  it("keeps the actionable text a startup guard wrote", () => {
    const message = errorMessage(new SchemaMissingError(["journal_entry"]));
    expect(message).toContain("journal_entry");
    expect(message).toContain("delete the database file");
  });

  it("passes a plain string through", () => {
    expect(errorMessage("Disk is full")).toBe("Disk is full");
  });

  it("never renders an empty box or [object Object]", () => {
    // Whatever comes back has to be worth reading — this is the last stop
    // before it becomes the only thing on screen.
    for (const thrown of [undefined, null, {}, new Error(""), ""]) {
      const message = errorMessage(thrown);
      expect(message.length).toBeGreaterThan(0);
      expect(message).not.toContain("[object Object]");
    }
  });
});
