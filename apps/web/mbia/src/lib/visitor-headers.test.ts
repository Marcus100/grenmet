import { describe, expect, it } from "vitest";
import { visitorAddress, visitorHeaders } from "@/lib/visitor-headers";

const secret = "s".repeat(32);
const from = (entries: Record<string, string>) => new Headers(entries);
const chain = from({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 172.70.0.1" });

describe("visitorAddress", () => {
  it("takes the right-most entry at one hop and ignores forged leading entries", () => {
    expect(visitorAddress(chain, 1)).toBe("172.70.0.1");
  });

  it("takes the entry behind the second proxy at two hops", () => {
    expect(visitorAddress(chain, 2)).toBe("203.0.113.7");
  });

  it("returns null for garbage, ports and chains shorter than the hops", () => {
    expect(visitorAddress(from({ "x-forwarded-for": "not-an-ip" }))).toBeNull();
    expect(
      visitorAddress(from({ "x-forwarded-for": "1.2.3.4:80" }))
    ).toBeNull();
    expect(
      visitorAddress(from({ "x-forwarded-for": "1.2.3.4" }), 2)
    ).toBeNull();
  });

  it("ignores x-real-ip", () => {
    expect(visitorAddress(from({ "x-real-ip": "198.51.100.2" }))).toBeNull();
  });
});

describe("visitorHeaders", () => {
  it("sends the address with the secret", () => {
    expect(visitorHeaders(chain, secret, 2)).toEqual({
      "X-Visitor-IP": "203.0.113.7",
      "X-Visitor-Secret": secret,
    });
  });

  it("sends nothing without a secret or an address", () => {
    expect(visitorHeaders(chain, undefined)).toEqual({});
    expect(visitorHeaders(from({}), secret)).toEqual({});
  });
});
