import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";

describe("parseEnv", () => {
  it("defaults to the planned scanner address", () => {
    expect(parseEnv({}).PRINTIX_SITE_URL).toBe("https://scan.printixevent.com");
  });

  it("keeps only the origin of a configured URL", () => {
    expect(
      parseEnv({ PRINTIX_SITE_URL: " http://localhost:3064/scan " })
        .PRINTIX_SITE_URL
    ).toBe("http://localhost:3064");
  });

  it("falls back on an invalid URL", () => {
    expect(parseEnv({ PRINTIX_SITE_URL: "not a url" }).PRINTIX_SITE_URL).toBe(
      "https://scan.printixevent.com"
    );
  });
});
