import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () =>
    Promise.resolve({ get: () => undefined, set: () => undefined }),
}));

import { completeAppSignIn, startAppSignIn } from "../app-sign-in";

const config = {
  appName: "events",
  authApiBaseUrl: "http://api.test",
  authApiPrefix: "/api/v1",
  authAppUrl: "https://auth.barrels.test",
  sessionCookieName: "events_session",
};
const STATE_COOKIE = "events_session_sso";

function sessionResponse() {
  return {
    access_token: "access",
    token_type: "bearer",
    access_token_expires_at: "2030-01-01T00:00:00Z",
    session_token: "app-session-secret",
    session_expires_at: "2030-02-01T00:00:00Z",
    session: {
      id: "0b1f7c9e-0000-4000-8000-000000000001",
      user_id: "0b1f7c9e-0000-4000-8000-000000000002",
      client_type: "web",
      app_name: "events",
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
      email: "staffer@example.com",
      full_name: "Staff Member",
      is_active: true,
      is_superuser: false,
    },
  };
}

function start(returnTo: string) {
  const response = startAppSignIn(
    config,
    new NextRequest(
      `https://events.barrels.test/auth/start?returnTo=${encodeURIComponent(returnTo)}`
    )
  );
  const target = new URL(response.headers.get("location") ?? "");
  const cookie = response.cookies.get(STATE_COOKIE)?.value ?? "";
  return { response, target, cookie, state: target.searchParams.get("state") };
}

function callback(query: string, cookie?: string) {
  return new NextRequest(`https://events.barrels.test/auth/callback?${query}`, {
    headers: {
      host: "events.barrels.test",
      ...(cookie ? { cookie: `${STATE_COOKIE}=${cookie}` } : {}),
    },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("startAppSignIn", () => {
  it("sends the browser to auth's /continue with a fresh state", () => {
    const first = start("/events/launch?tab=rsvp");
    const second = start("/");
    expect(first.target.origin).toBe("https://auth.barrels.test");
    expect(first.target.pathname).toBe("/continue");
    expect(first.target.searchParams.get("app")).toBe("events");
    expect(first.state?.length).toBeGreaterThanOrEqual(16);
    expect(first.state).not.toBe(second.state);
    // The return path stays on this app; auth never sees it.
    expect(first.target.searchParams.has("returnTo")).toBe(false);
    expect(first.cookie.startsWith(`${first.state}.`)).toBe(true);
  });

  it("refuses to remember an off-site return address", () => {
    const { cookie } = start("https://evil.test/");
    expect(decodeURIComponent(cookie.split(".")[1] ?? "")).toBe("/");
  });
});

describe("completeAppSignIn", () => {
  it("redeems the code, sets this app's cookie and returns to the start page", async () => {
    const { cookie, state } = start("/events/launch?tab=rsvp");
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(Response.json(sessionResponse()));

    const response = await completeAppSignIn(
      config,
      callback(`code=one-use-code&state=${state}`, cookie),
      { clientSecret: "events-secret" }
    );

    expect(response.headers.get("location")).toBe(
      "https://events.barrels.test/events/launch?tab=rsvp"
    );
    expect(response.cookies.get("events_session")?.value).toBe(
      "app-session-secret"
    );
    expect(response.cookies.get(STATE_COOKIE)?.value).toBe("");
    expect(response.headers.get("referrer-policy")).toBe("no-referrer");
    const [url, init] = fetchMock.mock.calls[0] ?? [];
    expect(url).toBe("http://api.test/api/v1/auth/apps/events/handoff/redeem");
    expect(JSON.parse(String(init?.body))).toEqual({
      code: "one-use-code",
      state,
      client_secret: "events-secret",
    });
  });

  it("rejects a callback whose state doesn't match this browser", async () => {
    const { cookie } = start("/");
    const fetchMock = vi.spyOn(globalThis, "fetch");

    const forged = await completeAppSignIn(
      config,
      callback("code=attacker-code&state=attacker-state", cookie),
      { clientSecret: "events-secret", failurePath: "/sign-in" }
    );
    const missing = await completeAppSignIn(
      config,
      callback("code=attacker-code&state=attacker-state"),
      { clientSecret: "events-secret" }
    );

    expect(fetchMock).not.toHaveBeenCalled();
    expect(forged.headers.get("location")).toBe(
      "https://events.barrels.test/sign-in?sign_in=expired"
    );
    expect(missing.cookies.get("events_session")).toBeUndefined();
  });

  it("treats a refused code as expired but lets outages surface", async () => {
    const { cookie, state } = start("/");
    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ detail: "expired" }, { status: 400 })
    );
    const refused = await completeAppSignIn(
      config,
      callback(`code=c&state=${state}`, cookie),
      { clientSecret: "events-secret" }
    );
    expect(refused.headers.get("location")).toBe(
      "https://events.barrels.test/?sign_in=expired"
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      Response.json({ detail: "down" }, { status: 503 })
    );
    await expect(
      completeAppSignIn(config, callback(`code=c&state=${state}`, cookie), {
        clientSecret: "events-secret",
      })
    ).rejects.toThrow();
  });
});
