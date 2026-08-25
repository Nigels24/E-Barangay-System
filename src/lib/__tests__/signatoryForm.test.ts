import { describe, it, expect } from "vitest";
import {
  SIGNATORY_ROLE_OPTIONS,
  emptySignatoryForm,
  signatoryProblems,
  signatoryRoleLabel,
  toNewSignatoryInput,
  type SignatoryFormState,
} from "../signatoryForm";

function filled(overrides: Partial<SignatoryFormState> = {}): SignatoryFormState {
  return {
    ...emptySignatoryForm("2026-01-01"),
    name: "Juan Dela Cruz",
    designation: "Barangay Bookkeeper",
    ...overrides,
  };
}

describe("emptySignatoryForm", () => {
  it("defaults to Prepared by, blank name/designation, and the given date", () => {
    const form = emptySignatoryForm("2026-01-01");
    expect(form.role).toBe("prepared_by");
    expect(form.name).toBe("");
    expect(form.designation).toBe("");
    expect(form.effectiveFrom).toBe("2026-01-01");
  });
});

describe("signatoryProblems", () => {
  it("is empty for a fully filled form", () => {
    expect(signatoryProblems(filled())).toEqual([]);
  });

  it("flags a blank name, designation, and effective date", () => {
    const problems = signatoryProblems(filled({ name: "", designation: "", effectiveFrom: "" }));
    expect(problems).toContain("Give the signatory's name.");
    expect(problems).toContain("Give the signatory's designation.");
    expect(problems).toContain("Give the date this signatory takes effect.");
  });
});

describe("toNewSignatoryInput", () => {
  it("converts the form to the engine's input, trimming whitespace", () => {
    const input = toNewSignatoryInput(filled({ name: "  Juan Dela Cruz  ", role: "approved_by" }), 3);
    expect(input).toEqual({
      barangayId: 3,
      role: "approved_by",
      name: "Juan Dela Cruz",
      designation: "Barangay Bookkeeper",
      effectiveFrom: "2026-01-01",
    });
  });
});

describe("signatoryRoleLabel / SIGNATORY_ROLE_OPTIONS", () => {
  it("labels each role for display", () => {
    expect(signatoryRoleLabel("prepared_by")).toBe("Prepared by");
    expect(signatoryRoleLabel("certified_by")).toBe("Certified by");
    expect(signatoryRoleLabel("approved_by")).toBe("Approved by");
  });

  it("offers exactly the three roles, in the order a form should show them", () => {
    expect(SIGNATORY_ROLE_OPTIONS.map((o) => o.value)).toEqual(["prepared_by", "certified_by", "approved_by"]);
  });
});
