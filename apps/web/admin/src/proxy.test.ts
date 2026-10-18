import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { proxy } from "@/proxy";

function call(path: string, cookie?: string) {
  return proxy(
    new NextRequest(`http://localhost:3012${path}`, {
      headers: cookie ? { cookie } : {},
    })
  );
}

describe("proxy", () => {
  it("sends visitors without a session to sign-in with a return path", () => {
    const response = call("/organisations?page=2");
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("returnTo")).toBe("/organisations?page=2");
  });

  it("lets the sign-in, callback and health routes through", () => {
    for (const path of [
      "/signin",
      "/auth/start",
      "/auth/callback",
      "/api/health",
    ]) {
      expect(call(path).headers.get("location")).toBeNull();
    }
  });

  it("lets a request with a session cookie reach the server-side check", () => {
    expect(
      call("/", "barrels_admin_session=abc").headers.get("location")
    ).toBeNull();
  });
});
