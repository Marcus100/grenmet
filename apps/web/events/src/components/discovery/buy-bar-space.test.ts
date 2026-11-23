import { describe, expect, it } from "vitest";
import { BUY_BAR_SPACE_CLASS } from "./buy-bar-space";

describe("buy bar space at the end of the page", () => {
  it("reserves bar height only while a buy bar is on the page, on phones", () => {
    expect(BUY_BAR_SPACE_CLASS).toContain("max-lg:has-[[data-buy-bar]]:pb-36");
  });

  it("adds the installed app's tab bar and safe-area inset in standalone", () => {
    expect(BUY_BAR_SPACE_CLASS).toContain(
      "max-lg:standalone:has-[[data-buy-bar]]:pb-[calc(9rem_+_3.5rem_+_env(safe-area-inset-bottom))]"
    );
  });

  it("never reserves space on laptops", () => {
    for (const part of BUY_BAR_SPACE_CLASS.split(" ")) {
      expect(part.startsWith("lg:")).toBe(false);
    }
  });
});
