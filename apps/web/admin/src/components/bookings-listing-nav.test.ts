import { describe, expect, it } from "vitest";
import { CONSOLE_NAV } from "./console-nav";

describe("console navigation for bookings listings", () => {
  it("sits with the other platform review screens, next to moderation", () => {
    const platform = CONSOLE_NAV.find((group) => group.label === "Platform");
    const hrefs = platform?.items.map((item) => item.href) ?? [];
    expect(hrefs).toContain("/bookings/listings");
    expect(hrefs.indexOf("/bookings/listings")).toBe(
      hrefs.indexOf("/moderation") + 1
    );
  });
});
