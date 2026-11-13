import { describe, expect, it } from "vitest";
import { WARNING_LEVEL_GUIDANCE } from "./warning-level";

describe("WARNING_LEVEL_GUIDANCE", () => {
  it("gives plain advice when nothing is in force", () => {
    expect(WARNING_LEVEL_GUIDANCE.none).toBe(
      "Nothing in effect. Plan as normal."
    );
  });
});
