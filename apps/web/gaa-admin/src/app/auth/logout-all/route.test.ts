vi.mock("server-only", () => ({}));

import { describe, expect, it, vi } from "vitest";

const readSessionCookie = vi.hoisted(() => vi.fn());
const logoutAllSessions = vi.hoisted(() => vi.fn());
vi.mock("@/lib/server-session", () => ({
  readSessionCookie,
  logoutAllSessions,
  clearSessionCookieOnResponse: vi.fn(),
}));
vi.mock("@/lib/auth-config", () => ({
  getSignedOutUrl: ({ all }: { all?: boolean } = {}) =>
    `https://auth.barrels.test/signed-out?app=gaa-admin${all ? "&all=1" : ""}`,
}));

import { POST } from "./route";

function post(accept: string) {
  return POST(
    new Request("http://web-admin:3001/auth/logout-all", {
      method: "POST",
      headers: { accept },
    })
  );
}

describe("logout-all", () => {
  it("ends every session and lands on the signed-out-everywhere page", async () => {
    readSessionCookie.mockResolvedValue("admin-session");
    const response = await post("text/html");
    expect(logoutAllSessions).toHaveBeenCalledWith("admin-session");
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://auth.barrels.test/signed-out?app=gaa-admin&all=1"
    );
  });

  it("answers fetch callers with JSON", async () => {
    readSessionCookie.mockResolvedValue(null);
    const response = await post("application/json");
    expect(await response.json()).toEqual({ ok: true });
  });
});
