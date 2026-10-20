import { describe, expect, it } from "vitest";
import { parseEnv } from "./env";

describe("parseEnv", () => {
  it("is off, local and keyless by default", () => {
    expect(parseEnv({})).toEqual({
      BABYDOLL_API_URL: "http://localhost:8000",
      BABYDOLL_BOOKING_SLUG: "babydoll-beauty-bar",
      BABYDOLL_ONLINE_BOOKING: "off",
      NEXT_PUBLIC_TURNSTILE_SITE_KEY: "",
    });
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
