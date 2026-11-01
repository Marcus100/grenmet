import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const readSessionCookie = vi.fn();
const exchangeSessionForAccessToken = vi.fn();

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

function request(path: string, init: TestRequestInit = {}) {
  return new NextRequest(`http://admin.test${path}`, {
    ...init,
    headers: {
      cookie: "admin_session=session-token",
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
