import { describe, expect, it } from "vitest";
import { visitorAddressFromForwardedFor } from "./visitor-forward";

describe("visitorAddressFromForwardedFor", () => {
  it("takes the entry the trusted proxies appended, not a forged leading one", () => {
    expect(visitorAddressFromForwardedFor("203.0.113.9, 198.51.100.7", 1)).toBe(
      "198.51.100.7"
    );
    expect(
      visitorAddressFromForwardedFor("10.0.0.1, 198.51.100.7, 172.16.0.2", 2)
    ).toBe("198.51.100.7");
  });

  it("returns null for a missing or malformed entry", () => {
    expect(visitorAddressFromForwardedFor(null, 1)).toBeNull();
    expect(visitorAddressFromForwardedFor("not-an-ip", 1)).toBeNull();
  });
});
