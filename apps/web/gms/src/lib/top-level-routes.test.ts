// @vitest-environment node
import { describe, expect, it } from "vitest";
import { enabledLocations } from "@/lib/locations";
import { isUnknownOneWordPath, TOP_LEVEL_ROUTES } from "@/lib/top-level-routes";
import { APP_DIR, routesOnDisk } from "@/test/routes";

const ONE_WORD = /^\/[^/[.]+$/u;

describe("TOP_LEVEL_ROUTES", () => {
  it("lists every one-word route on disk, so none is answered with a 404", () => {
    const onDisk = routesOnDisk(APP_DIR)
      .filter((route) => ONE_WORD.test(route))
      .map((route) => route.slice(1));
    expect(onDisk.length).toBeGreaterThan(5);
    const missing = onDisk.filter((word) => !TOP_LEVEL_ROUTES.includes(word));
    expect(missing).toEqual([]);
  });
});

describe("isUnknownOneWordPath", () => {
  it("is true for a made-up word", () => {
    expect(isUnknownOneWordPath("/journey-missing-page")).toBe(true);
    expect(isUnknownOneWordPath("/smoke-missing-page-does-not-exist/")).toBe(
      true
    );
  });

  it("is false for a real page, a file, the home page and deeper paths", () => {
    expect(isUnknownOneWordPath("/about")).toBe(false);
    expect(isUnknownOneWordPath("/weather")).toBe(false);
    expect(isUnknownOneWordPath("/robots.txt")).toBe(false);
    expect(isUnknownOneWordPath("/")).toBe(false);
    expect(isUnknownOneWordPath("/about/anything")).toBe(false);
  });

  it("is false for every enabled place", () => {
    for (const place of enabledLocations()) {
      expect(isUnknownOneWordPath(`/${place.slug}`), place.slug).toBe(false);
    }
  });
});
