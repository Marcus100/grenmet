import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const readSessionCookie = vi.fn();
const exchangeSessionForAccessToken = vi.fn();

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth-config", () => ({
  getAuthApiBaseUrl: () => "http://fastapi.test",
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/server-session", () => ({
  clearSessionCookieOnResponse: vi.fn(),
  exchangeSessionForAccessToken: (...args: unknown[]) =>
    exchangeSessionForAccessToken(...args),
  isAuthApiError: () => false,
  readSessionCookie: () => readSessionCookie(),
}));

import { DELETE, GET, PATCH, POST } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

function signedIn(fetcher: ReturnType<typeof vi.fn>) {
  readSessionCookie.mockResolvedValue("session-token");
  exchangeSessionForAccessToken.mockResolvedValue({ access_token: "access-1" });
  vi.stubGlobal("fetch", fetcher);
}

interface TestRequestInit {
  body?: string;
  headers?: Record<string, string>;
  method?: string;
}

/** Headers a browser sends from this app's own pages. */
const SAME_ORIGIN = {
  host: "admin.test",
  origin: "http://admin.test",
  "x-forwarded-proto": "http",
};

function request(path: string, init: TestRequestInit = {}) {
  return new NextRequest(`http://admin.test${path}`, {
    ...init,
    headers: {
      cookie: "admin_session=session-token",
      ...SAME_ORIGIN,
      ...init.headers,
    },
  });
}

describe("API proxy route: normal module calls", () => {
  it("forwards a GET to the fixed base with the bearer token and query", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    signedIn(fetcher);

    const response = await GET(request("/api/v1/hr/roster?week=45"));

    expect(response.status).toBe(200);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://fastapi.test/api/v1/hr/roster?week=45");
    expect(init).toMatchObject({ method: "GET", cache: "no-store" });
    expect(new Headers(init.headers).get("authorization")).toBe(
      "Bearer access-1"
    );
  });

  it("forwards a POST body to a module path", async () => {
    const fetcher = vi
      .fn()
      .mockResolvedValue(Response.json({ id: 1 }, { status: 201 }));
    signedIn(fetcher);

    const response = await POST(
      request("/api/v1/cap/alerts", {
        method: "POST",
        body: JSON.stringify({ title: "Wind" }),
        headers: {
          "content-type": "application/json",
          cookie: "admin_session=session-token",
        },
      })
    );

    expect(response.status).toBe(201);
    const [url, init] = fetcher.mock.calls[0] ?? [];
    expect(String(url)).toBe("http://fastapi.test/api/v1/cap/alerts");
    expect(init.method).toBe("POST");
    expect(new TextDecoder().decode(init.body)).toBe('{"title":"Wind"}');
  });
});

describe("API proxy route: forwarded request headers", () => {
  it("passes only the allow-listed headers and the bearer token", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    signedIn(fetcher);

    await GET(
      request("/api/v1/hr/roster", {
        headers: {
          accept: "application/json",
          "accept-language": "en",
          authorization: "Bearer caller-supplied",
          "x-forwarded-for": "203.0.113.9",
          "x-forwarded-host": "evil.example",
          "x-request-id": "req-1",
          "x-steer": "elsewhere",
        },
      })
    );

    const [, init] = fetcher.mock.calls[0] ?? [];
    const sent = new Headers(init.headers);
    expect(Object.fromEntries(sent.entries())).toEqual({
      accept: "application/json",
      "accept-language": "en",
      authorization: "Bearer access-1",
      "x-request-id": "req-1",
    });
    expect(sent.get("cookie")).toBeNull();
  });

  it("keeps the content type on a write", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ id: 1 }));
    signedIn(fetcher);

    await POST(
      request("/api/v1/cap/alerts", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      })
    );

    const [, init] = fetcher.mock.calls[0] ?? [];
    expect(new Headers(init.headers).get("content-type")).toBe(
      "application/json"
    );
  });
});

describe("API proxy route: origin check on writes", () => {
  it.each([
    ["another site", { origin: "https://evil.example" }],
    ["a sibling host", { origin: "https://other.barrels.gd" }],
    ["no Origin header", { origin: "" }],
  ])(
    "answers 403 to a POST from %s without reading the session",
    async (_label, headers) => {
      const fetcher = vi.fn();
      signedIn(fetcher);
      const base = request("/api/v1/hr/leave", { method: "POST", body: "{}" });
      const forged = new Headers(base.headers);
      if (headers.origin) {
        forged.set("origin", headers.origin);
      } else {
        forged.delete("origin");
      }

      const response = await POST(
        new NextRequest(base.url, {
          method: "POST",
          body: "{}",
          headers: forged,
        })
      );

      expect(response.status).toBe(403);
      expect(fetcher).not.toHaveBeenCalled();
      expect(readSessionCookie).not.toHaveBeenCalled();
    }
  );

  it("refuses a cross-site DELETE and PATCH too", async () => {
    const fetcher = vi.fn();
    signedIn(fetcher);

    for (const [handler, method] of [
      [DELETE, "DELETE"],
      [PATCH, "PATCH"],
    ] as const) {
      const response = await handler(
        request("/api/v1/hr/leave/1", {
          method,
          headers: { origin: "https://evil.example" },
        })
      );
      expect(response.status).toBe(403);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("lets a read through without an Origin header", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    signedIn(fetcher);
    const base = request("/api/v1/hr/roster");
    const headers = new Headers(base.headers);
    headers.delete("origin");

    const response = await GET(new NextRequest(base.url, { headers }));

    expect(response.status).toBe(200);
  });
});

describe("API proxy route: refused paths", () => {
  it.each([
    ["traversal", "/api/v1/%2e%2e%2fadmin"],
    ["encoded slash", "/api/v1%2Fadmin"],
    ["double slash", "/api//evil.example/x"],
    ["host switch", "/api/http:%2F%2Fevil.example"],
    ["host switch with @", "/api/%40evil.example"],
  ])(
    "answers 400 for %s without contacting FastAPI or reading the session",
    async (_label, path) => {
      const fetcher = vi.fn();
      signedIn(fetcher);

      const response = await GET(request(path));

      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        detail: "Invalid request path.",
      });
      expect(fetcher).not.toHaveBeenCalled();
      expect(readSessionCookie).not.toHaveBeenCalled();
    }
  );

  it("refuses a bad path before the session check for every method", async () => {
    const fetcher = vi.fn();
    signedIn(fetcher);

    for (const handler of [DELETE, PATCH]) {
      const response = await handler(
        request("/api/v1/%2e%2e%2fadmin", {
          method: handler === DELETE ? "DELETE" : "PATCH",
        })
      );
      expect(response.status).toBe(400);
    }
    expect(fetcher).not.toHaveBeenCalled();
  });
});
