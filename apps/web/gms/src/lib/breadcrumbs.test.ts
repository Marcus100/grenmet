import { describe, expect, it } from "vitest";
import { breadcrumbTrail } from "@/lib/breadcrumbs";
import { NAV_SECTIONS } from "@/lib/nav-sections";

const labels = (path: string) => breadcrumbTrail(path).map((c) => c.label);

describe("breadcrumbTrail", () => {
  it("mirrors the nav: Section › Group › Page", () => {
    expect(breadcrumbTrail("/about")).toEqual([
      { href: "/about", label: "About" },
      { href: "/sitemap#about--about-gms", label: "About GMS" },
      { current: true, href: "/about", label: "What we do" },
    ]);
  });

  it("links the section crumb to the section's index page", () => {
    expect(breadcrumbTrail("/weather/3-day").slice(0, 2)).toEqual([
      { href: "/weather", label: "Weather" },
      { href: "/sitemap#weather--forecasts", label: "Forecasts" },
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
    expect(breadcrumbTrail("/alerts/bulletins/cyclone")).toEqual([
      { href: "/alerts", label: "Alerts" },
      { href: "/sitemap#alerts--in-effect", label: "In effect" },
      { current: false, href: "/alerts/bulletins", label: "All bulletins" },
    ]);
    expect(labels("/services/tourism/events/hurricane-expo")).toEqual([
      "Services",
      "Tourism & events",
      "Event forecasts",
    ]);
  });

  it("links dated content to its listing page", () => {
    expect(labels("/explore/news/2026/storm-season")).toEqual([
      "Learn & Explore",
      "Earth & Weather",
      "Latest news",
    ]);
  });

  it("gives pages outside the navigation no trail", () => {
    for (const path of ["/", "/privacy", "/sitemap"]) {
      expect(breadcrumbTrail(path)).toEqual([]);
    }
  });

  it("ignores a trailing slash", () => {
    expect(breadcrumbTrail("/about/")).toEqual(breadcrumbTrail("/about"));
  });
});
