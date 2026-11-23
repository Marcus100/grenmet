import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Matcher tests do not need deployment credentials or the auth service.
vi.mock("@/lib/auth-config", () => ({
  getAuthApiBaseUrl: () => "http://trusted-api:8000",
  getAuthApiPrefix: () => "/api/v1",
  getSessionCookieName: () => "test-session",
}));

const cutover = vi.hoisted(() => ({
  deskUrl: undefined as string | undefined,
}));
vi.mock("@/lib/env", () => ({
  getCapDeskCutoverUrl: () => cutover.deskUrl,
}));

import { config, proxy } from "./proxy";

/**
 * Next compiles each matcher entry into an anchored path regex. Rebuilding it
 * here lets us assert which requests the proxy is asked to handle at all —
 * anything it never sees cannot be redirected to /signin.
 */
function runsProxyOn(pathname: string): boolean {
  return config.matcher.some((pattern) =>
    new RegExp(`^${pattern}$`, "u").test(pathname)
  );
}

describe("proxy matcher", () => {
  it("guards the wxwatch pages", () => {
    expect(runsProxyOn("/wxwatch")).toBe(true);
    expect(runsProxyOn("/wxwatch/2026/02/06")).toBe(true);
  });

  it("guards the other consolidated admin modules", () => {
    for (const path of ["/", "/cap", "/hr/forms", "/salesbus", "/wxproducts"]) {
      expect(runsProxyOn(path)).toBe(true);
    }
  });

  it("lets archive images through", () => {
    // next/image fetches these without the session cookie, so a redirect to
    // /signin renders as a broken image rather than a login prompt.
    expect(
      runsProxyOn("/wxwatch/2026/02/06/12/202602061239_atlsea_latestBW.gif")
    ).toBe(false);
    expect(
      runsProxyOn("/wxwatch/goes19/2026/09/04/14/202609041446_abc123_x.jpg")
    ).toBe(false);
    expect(runsProxyOn("/wxwatch/2026/02/06/12/wg8conv.GIF")).toBe(false);
  });

  it("still lets the framework and app assets through", () => {
    expect(runsProxyOn("/_next/static/chunk.js")).toBe(false);
    expect(runsProxyOn("/favicon.ico")).toBe(false);
    // The map's web worker: sent to /signin, every map would stay blank.
    expect(runsProxyOn("/maplibre-gl-worker.mjs")).toBe(false);
    expect(runsProxyOn("/images/logo/gms.png")).toBe(false);
  });
});

it("routes weather to the runtime backend without a session exchange or login redirect", () => {
  const response = proxy(
    new NextRequest("https://admin.test/_backend/weather/products?kind=marine")
  );
  expect(response.headers.get("x-middleware-rewrite")).toBe(
    "http://trusted-api:8000/api/v1/wxproducts/products?kind=marine"
  );
});
it("routes browser-session validation to FastAPI", () => {
  const response = proxy(
    new NextRequest("https://admin.test/_backend/browser-session")
  );
  expect(response.headers.get("x-middleware-rewrite")).toBe(
    "http://trusted-api:8000/api/v1/auth/browser/session"
  );
});

it("routes archive downloads to FastAPI without stripping their path", () => {
  const response = proxy(
    new NextRequest(
      "https://admin.test/_backend/wxwatch/images/cimss/chart.gif"
    )
  );
  expect(response.headers.get("x-middleware-rewrite")).toBe(
    "http://trusted-api:8000/api/v1/wxwatch/images/cimss/chart.gif"
  );
});

describe("single sign-on routes", () => {
  it("lets the start and callback routes through without a session", () => {
    for (const path of ["/auth/start", "/auth/callback"]) {
      const response = proxy(new NextRequest(`https://admin.test${path}`));
      expect(response.headers.get("location")).toBeNull();
    }
    const guarded = proxy(new NextRequest("https://admin.test/hr"));
    expect(guarded.headers.get("location")).toBe(
      "https://admin.test/signin?returnTo=%2Fhr"
    );
  });
});

const ALERT_ID = "11111111-2222-4333-8444-555555555555";
const CAP_ORIGIN = "https://cap.test";

function adminRequest(path: string, signedIn = false): NextRequest {
  const request = new NextRequest(`https://admin.test${path}`);
  if (signedIn) request.cookies.set("test-session", "staff");
  return request;
}

describe("CAP desk cutover", () => {
  beforeEach(() => {
    cutover.deskUrl = `${CAP_ORIGIN}/desk/`;
  });
  afterEach(() => {
    cutover.deskUrl = undefined;
  });

  it.each([
    ["/cap", "/desk"],
    ["/cap/admin/new", "/desk/new"],
    [`/cap/admin/${ALERT_ID}`, `/desk/alerts/${ALERT_ID}`],
    [
      "/cap/alerts/urn:example%2Fupdated",
      "/desk/alerts/by-identifier/urn%3Aexample%2Fupdated",
    ],
    ["/cap/profiles", "/desk/profiles"],
    ["/cap/settings", "/desk/settings"],
    ["/cap/areas", "/desk/areas"],
    ["/cap/feeds", "/desk/feeds"],
    ["/cap/import", "/desk/import"],
    ["/cap/audit", "/desk/audit"],
    ["/cap/integrations", "/desk/integrations"],
    ["/cap/other/subpage", "/desk"],
  ])("redirects %s to %s with HTTP 307", (from, to) => {
    const response = proxy(adminRequest(from));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(CAP_ORIGIN + to);
  });

  it("keeps the complete query string", () => {
    const query = "?page=2&tag=a%2Fb&tag=c";
    const response = proxy(adminRequest(`/cap/audit${query}`));
    expect(response.headers.get("location")).toBe(
      `${CAP_ORIGIN}/desk/audit${query}`
    );
  });

  it.each(["/hr/forms", "/wxwatch", "/wxproducts", "/salesbus", "/capture"])(
    "leaves the existing proxy behavior for %s",
    (path) => {
      expect(
        proxy(adminRequest(path, true)).headers.get("location")
      ).toBeNull();
      expect(proxy(adminRequest(path)).headers.get("location")).toBe(
        `https://admin.test/signin?returnTo=${encodeURIComponent(path)}`
      );
    }
  );
});

it("keeps legacy CAP routing when cutover is off", () => {
  const path = "/cap/admin/new";
  expect(proxy(adminRequest(path, true)).headers.get("location")).toBeNull();
  expect(proxy(adminRequest(path)).headers.get("location")).toBe(
    "https://admin.test/signin?returnTo=%2Fcap%2Fadmin%2Fnew"
  );
});
