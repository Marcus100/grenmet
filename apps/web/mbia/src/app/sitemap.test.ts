import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { NEXT_PUBLIC_SITE_URL: "https://mbia.example.gd" },
}));
vi.mock("@/lib/content", () => ({
  getAllPages: () => [
    {
      dek: "",
      draft: false,
      section: "travel",
      slug: "baggage-policies",
      title: "Baggage",
    },
    {
      dek: "",
      draft: true,
      section: "travel",
      slug: "hidden",
      title: "Hidden",
    },
    {
      dek: "",
      draft: false,
      publishedAt: "2026-10-01",
      section: "news",
      slug: "update",
      title: "Update",
    },
  ],
}));

import sitemap from "./sitemap";

describe("sitemap", () => {
  const entries = sitemap();
  const urls = entries.map((entry) => entry.url);

  it("lists the static routes and section indexes", () => {
    expect(urls).toContain("https://mbia.example.gd");
    expect(urls).toContain("https://mbia.example.gd/flights");
    expect(urls).toContain("https://mbia.example.gd/airports/lauriston");
    expect(urls).toContain("https://mbia.example.gd/contact");
    expect(urls).toContain("https://mbia.example.gd/travel");
  });

  it("lists published pages and skips drafts", () => {
    expect(urls).toContain("https://mbia.example.gd/travel/baggage-policies");
    expect(urls).not.toContain("https://mbia.example.gd/travel/hidden");
  });

  it("keeps the publish date for news and has no duplicates", () => {
    const news = entries.find((e) => e.url.endsWith("/news/update"));
    expect(news?.lastModified).toBe("2026-10-01");
    expect(new Set(urls).size).toBe(urls.length);
  });
});
