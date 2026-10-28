import { describe, expect, it } from "vitest";
import { parseEnv } from "@/env";

describe("parseEnv", () => {
  it("defaults to the production origin", () => {
    expect(parseEnv({}).COMMIT_SITE_URL).toBe("https://commit.barrels.gd");
  });

  it("keeps only the origin of a configured URL", () => {
    expect(
      parseEnv({ COMMIT_SITE_URL: " http://localhost:3019/path " })
        .COMMIT_SITE_URL
    ).toBe("http://localhost:3019");
  });

  it("falls back on an invalid URL", () => {
    expect(parseEnv({ COMMIT_SITE_URL: "not a url" }).COMMIT_SITE_URL).toBe(
      "https://commit.barrels.gd"
    );
  });
});
