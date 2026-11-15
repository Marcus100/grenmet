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

describe("parseEnv API origin", () => {
  it("is empty when unset, so the scanner refuses to check tickets", () => {
    expect(parseEnv({}).NEXT_PUBLIC_API_URL).toBe("");
    expect(parseEnv({ NEXT_PUBLIC_API_URL: "  " }).NEXT_PUBLIC_API_URL).toBe(
      ""
    );
  });

  it("keeps the origin of an https API", () => {
    expect(
      parseEnv({ NEXT_PUBLIC_API_URL: "https://api.example.test/api/v1" })
        .NEXT_PUBLIC_API_URL
    ).toBe("https://api.example.test");
  });

  it("allows plain http only on this machine", () => {
    expect(
      parseEnv({ NEXT_PUBLIC_API_URL: "http://localhost:8000" })
        .NEXT_PUBLIC_API_URL
    ).toBe("http://localhost:8000");
    expect(
      parseEnv({ NEXT_PUBLIC_API_URL: "http://api.example.test" })
        .NEXT_PUBLIC_API_URL
    ).toBe("");
  });

  it("refuses a value that is not a URL", () => {
    expect(parseEnv({ NEXT_PUBLIC_API_URL: "api" }).NEXT_PUBLIC_API_URL).toBe(
      ""
    );
  });
});
