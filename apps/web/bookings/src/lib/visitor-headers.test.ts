import { describe, expect, it } from "vitest";
import { visitorHeaders } from "@/lib/visitor-headers";

const secret = "s".repeat(32);
const from = (entries: Record<string, string>) => new Headers(entries);

describe("visitorHeaders", () => {
  it("forwards the first x-forwarded-for address with the secret", () => {
    expect(
      visitorHeaders(
        from({ "x-forwarded-for": "203.0.113.7, 10.0.0.1" }),
        secret
      )
    ).toEqual({ "X-Visitor-IP": "203.0.113.7", "X-Visitor-Secret": secret });
  });

  it("falls back to x-real-ip", () => {
    expect(
      visitorHeaders(from({ "x-real-ip": "198.51.100.2" }), secret)
    ).toEqual({ "X-Visitor-IP": "198.51.100.2", "X-Visitor-Secret": secret });
  });

  it("sends nothing without a secret or an address", () => {
    expect(
      visitorHeaders(from({ "x-real-ip": "198.51.100.2" }), undefined)
    ).toEqual({});
    expect(visitorHeaders(from({}), secret)).toEqual({});
  });
});
