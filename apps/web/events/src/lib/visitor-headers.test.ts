import { describe, expect, it } from "vitest";
import { visitorAddress, visitorHeaders } from "@/lib/visitor-headers";

const secret = "s".repeat(32);
const from = (entries: Record<string, string>) => new Headers(entries);
const chain = from({ "x-forwarded-for": "6.6.6.6, 203.0.113.7, 172.70.0.1" });

describe("visitorHeaders", () => {
  it("hops=1 takes the right-most entry, ignoring forged leading ones", () => {
    expect(visitorAddress(chain, 1)).toBe("172.70.0.1");
    expect(
      visitorAddress(from({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }))
    ).toBe("203.0.113.7");
  });

  it("hops=2 takes the entry behind the second proxy", () => {
    expect(visitorAddress(chain, 2)).toBe("203.0.113.7");
  });

  it("sends the address with the secret", () => {
    expect(visitorHeaders(chain, secret, 2)).toEqual({
      "X-Visitor-IP": "203.0.113.7",
      "X-Visitor-Secret": secret,
    });
  });

  it("drops garbage and short chains", () => {
    expect(visitorAddress(from({ "x-forwarded-for": "not-an-ip" }))).toBeNull();
    expect(
      visitorAddress(from({ "x-forwarded-for": "1.2.3.4" }), 2)
    ).toBeNull();
    expect(
      visitorAddress(from({ "x-forwarded-for": "1.2.3.4:80" }))
    ).toBeNull();
  });

  it("ignores x-real-ip", () => {
    expect(
      visitorHeaders(from({ "x-real-ip": "198.51.100.2" }), secret)
    ).toEqual({});
  });

  it("sends nothing without a secret or an address", () => {
    expect(visitorHeaders(chain, undefined)).toEqual({});
    expect(visitorHeaders(from({}), secret)).toEqual({});
  });
});

describe("spoofed forwarding", () => {
  it("ignores a forged leading entry and x-visitor-ip sent by the visitor", () => {
    const incoming = from({
      "x-forwarded-for": "9.9.9.9, 203.0.113.7",
      "x-visitor-ip": "8.8.8.8",
    });
    expect(visitorHeaders(incoming, secret, 1)).toEqual({
      "X-Visitor-IP": "203.0.113.7",
      "X-Visitor-Secret": secret,
    });
  });

  it("accepts IPv6 and rejects a hop count past the chain", () => {
    expect(visitorAddress(from({ "x-forwarded-for": "2001:db8::1" }))).toBe(
      "2001:db8::1"
    );
    expect(visitorAddress(chain, 4)).toBeNull();
  });
});
