import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3015${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("proxy", () => {
  it("lets visitors read public pages and start sign-in", () => {
    for (const path of [
      "/",
      "/signin",
      "/auth/start",
      "/api/health",
      "/some-business",
    ]) {
      expect(proxy(request(path)).status).toBe(200);
    }
  });

  it("sends signed-out visitors from /studio to sign-in with the path kept", () => {
    const response = proxy(request("/studio/settings?tab=hours"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("returnTo")).toBe(
      "/studio/settings?tab=hours"
    );
  });

  it("does not treat a business slug that starts with studio as staff", () => {
    expect(proxy(request("/studiobarber")).status).toBe(200);
  });

  it("lets a request with a session cookie through to /studio", () => {
    const response = proxy(request("/studio", "bookings_session=abc"));
    expect(response.status).toBe(200);
  });
});
