import { expect, it } from "vitest";
import sitemap from "@/app/sitemap";
import { env } from "@/lib/env";
import { sitemapPaths } from "@/lib/sitemap-paths";

it("lists each public page as an absolute address on the site", () => {
  const entries = sitemap();
  expect(entries.map((entry) => entry.url)).toEqual(
    sitemapPaths().map((path) => new URL(path, env.NEXT_PUBLIC_SITE_URL).href)
  );
  expect(entries[0]?.url).toBe(new URL("/", env.NEXT_PUBLIC_SITE_URL).href);
});
