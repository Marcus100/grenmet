import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { isPublicPath, proxy } from "@/proxy";

function request(path: string, cookie?: string) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  return new NextRequest(`http://localhost:3018${path}`, { headers });
}

describe("proxy", () => {
  it("lets visitors reach sign-in, the hand-off, health and the API proxy", () => {
    for (const path of [
      "/signin",
      "/auth/start",
      "/auth/callback",
      "/auth/logout",
      "/api/health",
      "/api/v1/profile-images/me",
    ]) {
      expect(proxy(request(path)).status, path).toBe(200);
    }
  });

  it("sends a signed-out visitor from the profile page to sign-in with the path kept", () => {
    const response = proxy(request("/?tab=photo"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("returnTo")).toBe("/?tab=photo");
  });

  it("lets a request with the account session cookie through", () => {
    expect(proxy(request("/", "account_session=abc")).status).toBe(200);
  });

  it("treats a path that only starts with a public word as private", () => {
    expect(isPublicPath("/signinx")).toBe(false);
    expect(isPublicPath("/authority")).toBe(false);
    expect(isPublicPath("/apiary")).toBe(false);
    expect(isPublicPath("/")).toBe(false);
  });
});
