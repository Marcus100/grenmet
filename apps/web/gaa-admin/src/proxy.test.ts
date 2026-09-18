import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

// Matcher tests do not need deployment credentials or the auth service.
vi.mock("@/lib/auth-config", () => ({
  getAuthApiBaseUrl: () => "http://trusted-api:8000",
  getAuthApiPrefix: () => "/api/v1",
  getSessionCookieName: () => "test-session",
}));

import { config, proxy } from "./proxy";

/**
 * Next compiles each matcher entry into an anchored path regex. Rebuilding it
 * here lets us assert which requests the proxy is asked to handle at all —
 * anything it never sees cannot be redirected to /signin.
 */
function runsProxyOn(pathname: string): boolean {
  return config.matcher.some((pattern) =>
    new RegExp(`^${pattern}$`).test(pathname)
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
