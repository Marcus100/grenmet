import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("is off, local and keyless by default", () => {
    expect(parseEnv({})).toEqual({
      BABYDOLL_API_URL: "http://localhost:8000",
      BABYDOLL_BOOKING_SLUG: "babydoll-beauty-bar",
      BABYDOLL_ONLINE_BOOKING: "off",
      TRUSTED_WEB_SECRET: undefined,
      VISITOR_IP_PROXY_HOPS: 1,
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    });
  });

  it("accepts a long enough visitor secret and rejects a short one", () => {
    const secret = "s".repeat(32);
    expect(parseEnv({ TRUSTED_WEB_SECRET: secret }).TRUSTED_WEB_SECRET).toBe(
      secret
    );
    expect(() => parseEnv({ TRUSTED_WEB_SECRET: "short" })).toThrow(
      "TRUSTED_WEB_SECRET"
    );
  });

  it("reads proxy hops as 1 to 5, defaults to 1, and rejects bad values", () => {
    expect(parseEnv({ VISITOR_IP_PROXY_HOPS: "2" }).VISITOR_IP_PROXY_HOPS).toBe(
      2
    );
    expect(parseEnv({ VISITOR_IP_PROXY_HOPS: "" }).VISITOR_IP_PROXY_HOPS).toBe(
      1
    );
    for (const value of ["0", "6", "x", "1.5"]) {
      expect(() => parseEnv({ VISITOR_IP_PROXY_HOPS: value })).toThrow(
        "VISITOR_IP_PROXY_HOPS"
      );
    }
  });

  it("turns on only for the word 'on'", () => {
    expect(
      parseEnv({ BABYDOLL_ONLINE_BOOKING: " ON " }).BABYDOLL_ONLINE_BOOKING
    ).toBe("on");
    for (const value of ["", "true", "1", "yes", "off"]) {
      expect(
        parseEnv({ BABYDOLL_ONLINE_BOOKING: value }).BABYDOLL_ONLINE_BOOKING
      ).toBe("off");
    }
  });

  it("keeps only the origin of the API address and ignores a bad one", () => {
    expect(
      parseEnv({ BABYDOLL_API_URL: "https://api.barrels.gd/api/v1" })
        .BABYDOLL_API_URL
    ).toBe("https://api.barrels.gd");
    expect(parseEnv({ BABYDOLL_API_URL: "not a url" }).BABYDOLL_API_URL).toBe(
      "http://localhost:8000"
    );
  });
});
