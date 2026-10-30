import path from "node:path";
import { describe, expect, it } from "vitest";
import { breadcrumbTrail } from "@/lib/breadcrumbs";
import { NAV_SECTIONS } from "@/lib/nav-sections";
import { APP_DIR, routesOnDisk } from "@/test/routes";

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

  it("files the Tropical Weather Outlook under Weather › Forecasts", () => {
    expect(breadcrumbTrail("/weather/tropics")).toEqual([
      { href: "/weather", label: "Weather" },
      { href: "/sitemap#weather--forecasts", label: "Forecasts" },
      {
        current: true,
        href: "/weather/tropics",
        label: "Tropical Weather Outlook",
      },
    ]);
    // Pages below it keep their own Tropical weather group.
    expect(labels("/weather/tropics/waves")).toEqual([
      "Weather",
      "Tropical weather",
      "Tropical waves",
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

  it("gives every section index page not in a group a trail of its section", () => {
    const linked = new Set(
      NAV_SECTIONS.flatMap((section) =>
        section.groups.flatMap((group) => group.links.map((link) => link.href))
      )
    );
    for (const section of NAV_SECTIONS) {
      if (linked.has(section.href)) {
        continue;
      }
      expect(breadcrumbTrail(section.href)).toEqual([
        { current: true, href: section.href, label: section.label },
      ]);
    }
    expect(labels("/marine")).toEqual(["Marine"]);
  });

  it("keeps the three-level trail for a section index that is also a link", () => {
    expect(labels("/weather")).toEqual(["Weather", "Forecasts", "Today"]);
  });

  it("gives the footer's About this site pages a trail under About", () => {
    expect(breadcrumbTrail("/privacy")).toEqual([
      { href: "/about", label: "About" },
      { href: "/sitemap#about--about-this-site", label: "About this site" },
      { current: true, href: "/privacy", label: "Privacy" },
    ]);
    expect(labels("/sitemap")).toEqual(["About", "About this site", "Sitemap"]);
    expect(labels("/disclaimer")).toEqual([
      "About",
      "About this site",
      "Disclaimer",
    ]);
  });

  it("gives pages outside the navigation no trail", () => {
    for (const path of ["/", "/no-such-page"]) {
      expect(breadcrumbTrail(path)).toEqual([]);
    }
  });

  it("gives every standing page on disk a trail unless it sits outside the nav", () => {
    // Every standing page is in the menu or the footer group, except the draft
    // preview: a noindex page reached only through a signed CMS link.
    const outside = new Set<string>(["/preview"]);
    const standing = routesOnDisk(path.join(APP_DIR, "(pages)")).filter(
      (route) => !route.includes("[")
    );
    expect(standing.length).toBeGreaterThan(0);
    for (const route of standing) {
      if (outside.has(route)) {
        expect(breadcrumbTrail(route)).toEqual([]);
      } else {
        expect(breadcrumbTrail(route).length, route).toBeGreaterThan(0);
      }
    }
  });

  it("ignores a trailing slash", () => {
    expect(breadcrumbTrail("/about/")).toEqual(breadcrumbTrail("/about"));
  });
});
