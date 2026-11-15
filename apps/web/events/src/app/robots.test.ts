import { describe, expect, it, vi } from "vitest";

vi.mock("@/env", () => ({
  env: { NEXT_PUBLIC_SITE_URL: "https://events.barrels.gd" },
}));

import robots from "./robots";

describe("events robots", () => {
  const result = robots();

  it("points crawlers at the sitemap on the events host", () => {
    expect(result.sitemap).toBe("https://events.barrels.gd/sitemap.xml");
  });

  it("allows public pages and disallows account, dashboard, message and sign-in paths", () => {
    expect(result.rules).toMatchObject({ allow: "/", userAgent: "*" });
    const disallow = (result.rules as { disallow: string[] }).disallow;
    for (const path of [
      "/me",
      "/messages",
      "/network",
      "/dash",
      "/sign-in",
      "/api/",
      "/auth/",
    ]) {
      expect(disallow).toContain(path);
    }
  });
});
