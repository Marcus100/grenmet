import { describe, expect, it } from "vitest";
import { breadcrumbTrail } from "@/lib/breadcrumbs";
import { NAV_SECTIONS } from "@/lib/nav-sections";

const labels = (path: string) => breadcrumbTrail(path).map((c) => c.label);

describe("breadcrumbTrail", () => {
  it("mirrors the nav: Section › Group › Page", () => {
    expect(breadcrumbTrail("/about")).toEqual([
      { href: "/about", label: "About" },
      { href: "/sitemap#about--the-service", label: "The service" },
      { current: true, href: "/about", label: "About GMS" },
    ]);
  });

  it("links a section without its own page to the sitemap", () => {
    expect(breadcrumbTrail("/forecasts/3-day").slice(0, 2)).toEqual([
      { href: "/sitemap#weather", label: "Weather" },
      { href: "/sitemap#weather--daily", label: "Daily" },
    ]);
  });

  it("gives every nav page exactly three crumbs, ending on itself", () => {
    for (const section of NAV_SECTIONS) {
      for (const group of section.groups) {
        for (const link of group.links) {
          if (link.href === "/") {
            continue;
          }
          const trail = breadcrumbTrail(link.href);
          expect(trail).toHaveLength(3);
          expect(trail[2]).toEqual({
            current: true,
            href: link.href,
            label: link.name,
          });
        }
      }
    }
  });

  it("shows a nested page's nav parent, linked", () => {
    expect(breadcrumbTrail("/bulletins/flood")).toEqual([
      { href: "/sitemap#warnings", label: "Warnings" },
      { href: "/sitemap#warnings--in-effect", label: "In effect" },
      { current: false, href: "/products/bulletins", label: "Bulletins" },
    ]);
    expect(labels("/events/hurricane-expo")).toEqual([
      "Sectors",
      "Industry and community",
      "Event Forecasts",
    ]);
  });

  it("links dated content to its listing page", () => {
    expect(breadcrumbTrail("/news/2026/storm-season")).toEqual([
      { href: "/news", label: "News" },
    ]);
  });

  it("gives pages outside the navigation no trail", () => {
    for (const path of ["/", "/privacy", "/sitemap", "/news"]) {
      expect(breadcrumbTrail(path)).toEqual([]);
    }
  });

  it("ignores a trailing slash", () => {
    expect(breadcrumbTrail("/about/")).toEqual(breadcrumbTrail("/about"));
  });
});
