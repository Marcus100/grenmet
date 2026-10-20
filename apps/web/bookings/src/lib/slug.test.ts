import { describe, expect, it } from "vitest";
import { isBusinessSlug } from "./slug";

describe("isBusinessSlug", () => {
  it.each(["babydoll", "a", "bc-2", "salon-1-st-george", "a".repeat(64)])(
    "accepts %s",
    (slug) => {
      expect(isBusinessSlug(slug)).toBe(true);
    }
  );

  it.each([
    "",
    "-lead",
    "trail-",
    "Upper",
    "under_score",
    "a/b",
    "a".repeat(65),
  ])("rejects %s", (slug) => {
    expect(isBusinessSlug(slug)).toBe(false);
  });
});
