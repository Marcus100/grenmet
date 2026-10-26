import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SITE_URL: "https://mbia.example.gd/" },
}));

import robots from "./robots";

describe("robots", () => {
  it("allows all crawlers and links the sitemap", () => {
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBe("https://mbia.example.gd/sitemap.xml");
  });

  it("never disallows anything", () => {
    expect(JSON.stringify(robots())).not.toContain("disallow");
  });
});
