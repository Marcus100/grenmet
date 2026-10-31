// @vitest-environment node
import { describe, expect, it } from "vitest";
import { plannedPaths } from "@/lib/nav-sections";
import { PLANNED_ROUTE_PREFIX, plannedRewrites } from "@/lib/planned-routes";
import { APP_DIR, matches, routesOnDisk, serves } from "@/test/routes";

describe("planned page rewrites", () => {
  const routes = routesOnDisk(APP_DIR);
  const plannedRoute = `${PLANNED_ROUTE_PREFIX}/[...planned]`;

  it("the placeholder route lives under the internal prefix", () => {
    expect(routes).toContain(plannedRoute);
    expect(routes.filter((route) => route.startsWith("/[..."))).toEqual([]);
  });

  it("sends every planned link to the placeholder route, and nothing else", () => {
    const rewrites = plannedRewrites();
    expect(rewrites.map((rewrite) => rewrite.source)).toEqual(plannedPaths());
    for (const { source, destination } of rewrites) {
      expect(matches(plannedRoute, destination)).toBe(true);
      // No real route may serve a planned address: it would shadow the rewrite.
      expect(routes.filter((route) => serves(route, source))).toEqual([]);
    }
  });
});
