vi.mock("server-only", () => ({}));

import { describe, expect, it, vi } from "vitest";

const readSessionCookie = vi.hoisted(() => vi.fn());
const logoutSession = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server-session", () => ({
  readSessionCookie,
  logoutSession,
  clearSessionCookieOnResponse: vi.fn(),
}));
vi.mock("@/lib/auth-config", () => ({
  getSignedOutUrl: () => "https://auth.barrels.test/signed-out?app=gaa-admin",
}));

import { POST } from "./route";

function post(accept: string) {
  return POST(
    new Request("http://web-admin:3001/auth/logout", {
      method: "POST",
      headers: { accept },
    })
  );
}

describe("logout", () => {
  it("lands browser form posts on the auth signed-out page, not back on sign-in", async () => {
    readSessionCookie.mockResolvedValue(null);
    const response = await post("text/html");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://auth.barrels.test/signed-out?app=gaa-admin"
    );
  });

  it("ends only this app's session", async () => {
    readSessionCookie.mockResolvedValue("admin-session");
    await post("text/html");
    expect(logoutSession).toHaveBeenCalledWith("admin-session");
  });

  it("still signs the browser out when the upstream session is already gone", async () => {
    readSessionCookie.mockResolvedValue("admin-session");
    logoutSession.mockRejectedValueOnce(new Error("revoked"));
    const response = await post("text/html");
    expect(response.status).toBe(303);
  });

  it("answers fetch callers with JSON", async () => {
    readSessionCookie.mockResolvedValue(null);
    const response = await post("*/*");
    expect(await response.json()).toEqual({ ok: true });
  });
});
