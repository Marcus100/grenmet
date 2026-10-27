import { describe, expect, it } from "vitest";
import { isBusinessSlug, isReservedSlug } from "./slug";

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

  it.each(["studio", "signin", "auth", "api"])(
    "rejects the reserved slug %s",
    (slug) => {
      expect(isReservedSlug(slug)).toBe(true);
      expect(isBusinessSlug(slug)).toBe(false);
    }
  );

  it("still accepts slugs that merely start with a reserved word", () => {
    expect(isBusinessSlug("studio-one")).toBe(true);
    expect(isBusinessSlug("apiary")).toBe(true);
  });
});
