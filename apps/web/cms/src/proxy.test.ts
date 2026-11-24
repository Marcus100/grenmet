import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./env", () => ({
  getEnv: () => ({ CMS_SESSION_COOKIE_NAME: "cms_session" }),
}));

import { proxy } from "./proxy";

function request(path: string, cookie?: string): NextRequest {
  const headers = new Headers();
  if (cookie) headers.set("cookie", `cms_session=${cookie}`);
  return new NextRequest(`https://cms.barrels.test${path}`, { headers });
}

describe("proxy (signed-out editor visits)", () => {
  it("redirects a signed-out visit to /admin to sign-in before the editor renders", () => {
    const response = proxy(request("/admin"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "https://cms.barrels.test/signin"
    );
  });

  it("redirects deeper editor paths the same way", () => {
    const response = proxy(request("/admin/collections/stories"));
    expect(response.headers.get("location")).toBe(
      "https://cms.barrels.test/signin"
    );
  });

  it("lets a request with a session cookie through to the page's own check", () => {
    const response = proxy(request("/admin", "opaque-session"));
    expect(response.headers.get("location")).toBeNull();
  });
});
