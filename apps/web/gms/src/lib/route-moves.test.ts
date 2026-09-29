// @vitest-environment node
//
// Node, not jsdom: walks the app directory to prove the IA migration left no
// old route behind and that every redirect lands on a real page.
import { describe, expect, it } from "vitest";
import { movedPath, ROUTE_MOVES, routeMoveRedirects } from "@/lib/route-moves";
import { APP_DIR, routesOnDisk, serves } from "@/test/routes";

const routes = [...routesOnDisk(APP_DIR), "/"];
const isServed = (href: string) => routes.some((route) => serves(route, href));

describe("ROUTE_MOVES", () => {
  it.each(ROUTE_MOVES.map(([from]) => from))(
    "%s is no longer served by a page",
    (from) => {
      expect(isServed(from)).toBe(false);
    }
  );

  it.each(ROUTE_MOVES)("%s redirects to a real page at %s", (_from, to) => {
    expect(isServed(to)).toBe(true);
  });

  it("sends every old URL straight to its final page, never via another move", () => {
    for (const [, to] of ROUTE_MOVES) {
      expect(movedPath(to)).toBe(to);
    }
  });

  it("lists more specific prefixes before the prefixes that contain them", () => {
    for (const [i, [from]] of ROUTE_MOVES.entries()) {
      const shadowedBy = ROUTE_MOVES.slice(0, i).find(([earlier]) =>
        from.startsWith(`${earlier}/`)
      );
      expect(shadowedBy).toBeUndefined();
    }
  });
});

describe("movedPath", () => {
  it.each([
    ["/forecasts/2026/09/28", "/weather/2026/09/28"],
    ["/forecasts", "/weather"],
    ["/products/issued/abc", "/weather/issued/abc"],
    ["/bulletins/flood", "/alerts/bulletins/flood"],
    ["/resources/hurricane", "/alerts/prepare/hurricane"],
    ["/warnings", "/alerts"],
    ["/warnings/levels", "/alerts/levels"],
    ["/warnings/cyclone/archive", "/alerts/cyclone/archive"],
    ["/resources/hurricane-names", "/explore/hurricane-names"],
    ["/sectors/aviation", "/services/aviation"],
    ["/aviation/metar-taf", "/services/aviation/metar-taf"],
    ["/events/spicemas", "/services/tourism/events/spicemas"],
    ["/news/2026/storm", "/explore/news/2026/storm"],
    ["/newsletter", "/newsletter"],
    ["/alerts", "/alerts"],
    ["/warnings-archive", "/warnings-archive"],
  ])("%s → %s", (from, to) => {
    expect(movedPath(from)).toBe(to);
  });
});

describe("routeMoveRedirects", () => {
  it("redirects the bare prefix and everything under it, permanently", () => {
    expect(routeMoveRedirects()).toContainEqual({
      source: "/sectors/:path*",
      destination: "/services/:path*",
      permanent: true,
    });
    expect(routeMoveRedirects()).toContainEqual({
      source: "/almanac",
      destination: "/weather/sun-and-sky",
      permanent: true,
    });
  });
});
