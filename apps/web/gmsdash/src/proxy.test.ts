import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

function request(path: string, cookie?: string) {
  return new NextRequest(`http://localhost:3013${path}`, {
    headers: cookie ? { cookie } : {},
  });
}

describe("proxy", () => {
  it("lets visitors read the home page and start sign-in", () => {
    for (const path of ["/", "/signin", "/auth/start", "/api/health"]) {
      expect(proxy(request(path)).status).toBe(200);
    }
  });

  it("sends signed-out visitors from private pages to sign-in", () => {
    const response = proxy(request("/meteogram?point=mbia"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("returnTo")).toBe("/meteogram?point=mbia");
  });

  it("lets a request with a session cookie through", () => {
    const response = proxy(request("/access", "gmsdash_session=abc"));
    expect(response.status).toBe(200);
  });
});
