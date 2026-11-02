import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { storefrontExists } from "@/lib/storefront-exists";
import { NOT_FOUND_PATH, proxy } from "@/proxy";

vi.mock("@/lib/storefront-exists", () => ({ storefrontExists: vi.fn() }));
const exists = vi.mocked(storefrontExists);

function request(path: string, cookie?: string, extra: HeadersInit = {}) {
  const headers = new Headers(extra);
  if (cookie) {
    headers.set("cookie", cookie);
  }
  return new NextRequest(`http://localhost:3015${path}`, { headers });
}

/** Where a rewrite sends the request, or null when the proxy did not rewrite. */
function rewrittenTo(response: Response): string | null {
  const target = response.headers.get("x-middleware-rewrite");
  return target ? new URL(target).pathname : null;
}

beforeEach(() => {
  exists.mockReset();
  exists.mockResolvedValue(true);
});

describe("proxy", () => {
  it("lets visitors read public pages and start sign-in", async () => {
    for (const path of [
      "/",
      "/signin",
      "/auth/start",
      "/api/health",
      "/some-business",
    ]) {
      expect((await proxy(request(path))).status).toBe(200);
    }
  });

  it("sends signed-out visitors from /studio to sign-in with the path kept", async () => {
    const response = await proxy(request("/studio/settings?tab=hours"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/signin");
    expect(location.searchParams.get("returnTo")).toBe(
      "/studio/settings?tab=hours"
    );
  });

  it("sends signed-out visitors from the studio screens to sign-in", async () => {
    for (const path of [
      "/studio",
      "/studio/sea-salt/agenda?view=week",
      "/studio/sea-salt/bookings/abc",
    ]) {
      const response = await proxy(request(path));
      expect(response.status).toBe(307);
      expect(new URL(response.headers.get("location") ?? "").pathname).toBe(
        "/signin"
      );
    }
  });

  it("does not treat a business slug that starts with studio as staff", async () => {
    expect((await proxy(request("/studiobarber"))).status).toBe(200);
  });

  it("lets a request with a session cookie through to /studio", async () => {
    const response = await proxy(request("/studio", "bookings_session=abc"));
    expect(response.status).toBe(200);
  });
});

describe("proxy: booking addresses with no business", () => {
  it("answers an unknown business with the not-found page, status 404", async () => {
    exists.mockResolvedValue(false);
    const response = await proxy(request("/this-page-does-not-exist"));
    expect(response.status).toBe(404);
    expect(rewrittenTo(response)).toBe(NOT_FOUND_PATH);
    expect(exists).toHaveBeenCalledWith(
      "this-page-does-not-exist",
      expect.anything()
    );
  });

  it("answers a path that cannot be a business without asking the API", async () => {
    for (const path of ["/Not-A-Slug", "/-bad-", "/a_b"]) {
      const response = await proxy(request(path));
      expect(response.status).toBe(404);
      expect(rewrittenTo(response)).toBe(NOT_FOUND_PATH);
    }
    expect(exists).not.toHaveBeenCalled();
  });

  it("lets a business with a booking page through", async () => {
    const response = await proxy(request("/sea-salt"));
    expect(response.status).toBe(200);
    expect(rewrittenTo(response)).toBeNull();
  });

  it("lets the page decide when the API cannot answer", async () => {
    exists.mockResolvedValue(null);
    const response = await proxy(request("/sea-salt"));
    expect(response.status).toBe(200);
    expect(rewrittenTo(response)).toBeNull();
  });

  it("leaves client navigations, files, deeper paths and app routes to the routes", async () => {
    exists.mockResolvedValue(false);
    for (const [path, headers] of [
      ["/gone-business", { RSC: "1" }],
      ["/robots.txt", {}],
      ["/gone-business/booking/abc", {}],
      ["/signin", {}],
      ["/", {}],
    ] as const) {
      const response = await proxy(request(path, undefined, headers));
      expect(response.status, path).toBe(200);
      expect(rewrittenTo(response), path).toBeNull();
    }
    expect(exists).not.toHaveBeenCalled();
  });
});
