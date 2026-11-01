import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  clearSessionCookieOnResponse: vi.fn(),
  exchangeSessionForAccessToken: vi.fn(),
  logoutSession: vi.fn(),
  readSessionCookie: vi.fn(),
  getRequestOrigin: (headers: Headers) => `https://${headers.get("host")}`,
}));
vi.mock("@barrelsgd/auth/server", () => auth);
vi.mock("@barrelsgd/auth", () => ({ isAuthApiError: () => false }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { POST as logout } from "../auth/logout/route";
import { POST as proxyPost } from "./api/[...path]/route";

const ID = "11111111-2222-4333-8444-555555555555";
const HOST = { host: "cap.barrels.gd", origin: "https://cap.barrels.gd" };

function proxyRequest(body: BodyInit, headers: Record<string, string> = {}) {
  return new NextRequest(
    `https://cap.barrels.gd/desk/api/v1/cap/alerts/${ID}/cancel`,
    {
      body,
      headers: { ...HOST, ...headers },
      method: "POST",
    }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  auth.readSessionCookie.mockResolvedValue("session");
  auth.exchangeSessionForAccessToken.mockResolvedValue({ access_token: "t" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response("{}", { status: 200 }))
  );
});

describe("POST /auth/logout", () => {
  it("refuses a request from another origin and keeps the session", async () => {
    const response = await logout(
      new Request("https://cap.barrels.gd/auth/logout", {
        headers: {
          host: "cap.barrels.gd",
          origin: "https://events.barrels.gd",
        },
        method: "POST",
      })
    );
    expect(response.status).toBe(403);
    expect(auth.logoutSession).not.toHaveBeenCalled();
  });

  it("signs out a same-origin request", async () => {
    const response = await logout(
      new Request("https://cap.barrels.gd/auth/logout", {
        headers: HOST,
        method: "POST",
      })
    );
    expect(response.status).toBe(303);
    expect(auth.logoutSession).toHaveBeenCalled();
  });
});

describe("POST /desk/api", () => {
  it("answers 413 for a body over the limit and never calls FastAPI", async () => {
    const response = await proxyPost(proxyRequest(new Uint8Array(1_000_001)));
    expect(response.status).toBe(413);
    expect(await response.json()).toEqual({
      detail: "The request is too large.",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("answers 413 when Content-Length already says it is too large", async () => {
    const response = await proxyPost(
      proxyRequest("{}", { "content-length": "5000000" })
    );
    expect(response.status).toBe(413);
  });

  it("still forwards a normal body", async () => {
    const response = await proxyPost(
      proxyRequest(JSON.stringify({ note: "Issued in error" }))
    );
    expect(response.status).toBe(200);
    expect(fetch).toHaveBeenCalledOnce();
  });
});
