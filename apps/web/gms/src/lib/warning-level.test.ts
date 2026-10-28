import { describe, expect, it } from "vitest";
import { WARNING_LEVEL_GUIDANCE } from "./warning-level";

describe("WARNING_LEVEL_GUIDANCE", () => {
  it("says there are no active alerts when nothing is in force", () => {
    expect(WARNING_LEVEL_GUIDANCE.none).toBe("No active alerts");
  });
});
