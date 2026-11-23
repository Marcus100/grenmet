import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isPublicPath, proxy } from "@/proxy";

function request(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(`http://localhost:3016${path}`, { headers });
}

describe("proxy", () => {
  it("lets visitors reach sign-in, the hand-off and health", () => {
    for (const path of [
      "/signin",
      "/auth/start",
      "/auth/callback",
      "/auth/logout",
      "/api/health",
    ]) {
      expect(proxy(request(path)).status, path).toBe(200);
    }
  });

  it("sends a signed-out visitor to an organisation page to sign-in with the path kept", () => {
    const response = proxy(request("/acme?tab=roster"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("returnTo")).toBe("/acme?tab=roster");
  });

  it("lets a request with the HR session cookie through", () => {
    expect(proxy(request("/", "hr_session=abc")).status).toBe(200);
  });

  it("does not treat the API paths as public", () => {
    expect(isPublicPath("/api/v1/hr/me/organisations")).toBe(false);
  });

  it("treats a path that only starts with a public word as private", () => {
    expect(isPublicPath("/signinx")).toBe(false);
    expect(isPublicPath("/authority")).toBe(false);
    expect(isPublicPath("/api/healthz")).toBe(false);
  });
});
