import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

const jar = vi.hoisted(() => new Map<string, string>());
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () =>
    Promise.resolve({
      get: (name: string) =>
        jar.has(name) ? { name, value: jar.get(name) } : undefined,
      set: () => undefined,
    }),
}));

import { accountStatusResponse, signOutResponse } from "../account-routes";

const config = {
  appName: "weather",
  authApiBaseUrl: "http://api.test",
  authApiPrefix: "/api/v1",
  authAppUrl: "https://auth.barrels.test",
  sessionCookieName: "weather_session",
};

function request(
  cookie = "",
  init: { method?: string; headers?: Record<string, string> } = {}
) {
  return new NextRequest("https://weather.barrels.test/auth/me", {
    method: init.method,
    headers: { cookie, ...init.headers },
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  jar.clear();
});

describe("accountStatusResponse", () => {
  it("answers signed-out visitors without calling the API", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const response = await accountStatusResponse(config, request());
    expect(await response.json()).toEqual({ signedIn: false });
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("names the account and shows the sign-in notice once", async () => {
    jar.set("weather_session", "secret");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({
        access_token: "t",
        token_type: "bearer",
        access_token_expires_at: "2030-01-01T00:00:00Z",
        session_expires_at: "2030-02-01T00:00:00Z",
        session: {
          id: "0b1f7c9e-0000-4000-8000-000000000001",
          user_id: "0b1f7c9e-0000-4000-8000-000000000002",
          client_type: "web",
          app_name: "weather",
          user_agent: null,
          ip_address: null,
          expires_at: "2030-02-01T00:00:00Z",
          last_used_at: "2030-01-01T00:00:00Z",
          revoked_at: null,
          created_at: "2030-01-01T00:00:00Z",
          updated_at: "2030-01-01T00:00:00Z",
        },
        user: {
          id: "0b1f7c9e-0000-4000-8000-000000000002",
          email: "kezia@example.com",
          full_name: "Kezia Mitchell",
          is_active: true,
          is_superuser: false,
        },
      })
    );
    const response = await accountStatusResponse(
      config,
      request("weather_session=secret; weather_session_notice=1")
    );
    expect(await response.json()).toEqual({
      signedIn: true,
      name: "Kezia Mitchell",
      email: "kezia@example.com",
      accountUrl: "https://auth.barrels.test",
      notice: true,
    });
    expect(response.cookies.get("weather_session_notice")?.value).toBe("");
  });

  it("clears a revoked session", async () => {
    jar.set("weather_session", "revoked");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ detail: "Invalid session" }, { status: 401 })
    );
    const response = await accountStatusResponse(config, request());
    expect(await response.json()).toEqual({ signedIn: false });
    expect(response.cookies.get("weather_session")?.value).toBe("");
  });
});

describe("signOutResponse", () => {
  it("refuses cross-site requests", async () => {
    const response = await signOutResponse(
      config,
      request("", { method: "POST", headers: { origin: "https://evil.test" } })
    );
    expect(response.status).toBe(403);
  });

  it("ends only this site's session and clears its cookie", async () => {
    jar.set("weather_session", "secret");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json({ message: "ok" }));
    const response = await signOutResponse(
      config,
      request("", {
        method: "POST",
        headers: { origin: "https://weather.barrels.test" },
      })
    );
    expect(response.status).toBe(200);
    expect(String(fetchMock.mock.calls[0]?.[0])).toBe(
      "http://api.test/api/v1/login/session/logout"
    );
    expect(response.cookies.get("weather_session")?.value).toBe("");
  });
});
