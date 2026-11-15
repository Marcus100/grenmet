import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SITE_URL: "https://mbia.example.gd/" },
}));

import robots from "./robots";

describe("robots", () => {
  it("allows the public airport pages and links the sitemap", () => {
    const result = robots();
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBe("https://mbia.example.gd/sitemap.xml");
  });

  it("disallows the sign-in callbacks, the API and the runtime config", () => {
    const disallow = (robots().rules as { disallow: string[] }).disallow;
    expect(disallow).toEqual(
      expect.arrayContaining(["/api/", "/auth/", "/runtime-env.js"])
    );
  });
});
