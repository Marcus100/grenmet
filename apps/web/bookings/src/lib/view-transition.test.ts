import { describe, expect, it } from "vitest";
import { businessTransitionStyle } from "./view-transition";

describe("businessTransitionStyle", () => {
  it("names a safe slug biz-<slug>", () => {
    expect(businessTransitionStyle("tide-barbers")).toEqual({
      "--vt": "biz-tide-barbers",
    });
    expect(businessTransitionStyle("a1")).toEqual({ "--vt": "biz-a1" });
  });

  it.each([
    "",
    "Tide",
    "tide barbers",
    "-tide",
    "tide-",
    "tide;color:red",
    "tide)",
    "ti\\de",
    "x".repeat(70),
  ])("emits nothing for %j", (slug) => {
    expect(businessTransitionStyle(slug)).toBeUndefined();
  });
});
