import type { EregisterValidationError } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { isSynopRefusal } from "./eregister-refusal";

const REFUSAL: EregisterValidationError = {
  detail: {
    message: "Observation does not pass validation: dew_point: above air",
    issues: [
      {
        field: "dew_point",
        code: "dew_point_above_air",
        message: "above air",
        severity: "error",
      },
    ],
  },
};

describe("isSynopRefusal", () => {
  it("accepts the structured SYNOP 422 body", () => {
    expect(isSynopRefusal(REFUSAL)).toBe(true);
  });

  it("rejects the other bodies a 422 or another status can carry", () => {
    expect(isSynopRefusal({ detail: "A reason is required" })).toBe(false);
    expect(isSynopRefusal({ detail: "Validation error", errors: [] })).toBe(
      false
    );
    expect(
      isSynopRefusal({ detail: [{ loc: ["body"], msg: "x", type: "y" }] })
    ).toBe(false);
    expect(isSynopRefusal({ detail: { message: "no issues" } })).toBe(false);
    expect(isSynopRefusal(undefined)).toBe(false);
    expect(isSynopRefusal("boom")).toBe(false);
  });
});
