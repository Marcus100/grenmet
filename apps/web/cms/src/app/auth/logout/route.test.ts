import { afterEach, describe, expect, it, vi } from "vitest";

const readSessionCookie = vi.hoisted(() => vi.fn());
const logoutSession = vi.hoisted(() => vi.fn());
const clearSessionCookieOnResponse = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/auth-config", () => ({
  getAuthConfig: () => ({ authAppUrl: "https://auth.barrels.test" }),
}));
vi.mock("@barrelsgd/auth/server", () => ({
  clearSessionCookieOnResponse,
  logoutSession,
  readSessionCookie,
}));

import { POST } from "./route";

const post = (headers: Record<string, string> = {}) =>
  POST(
    new Request("https://cms.barrels.test/auth/logout", {
      headers,
      method: "POST",
    })
  );

afterEach(() => vi.resetAllMocks());

describe("POST /auth/logout", () => {
  it("ends the CMS session and lands on the auth signed-out page", async () => {
    readSessionCookie.mockResolvedValue("cms-session");
    const response = await post();
    expect(logoutSession).toHaveBeenCalledWith(
      { authAppUrl: "https://auth.barrels.test" },
      "cms-session"
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://auth.barrels.test/signed-out"
    );
    expect(clearSessionCookieOnResponse).toHaveBeenCalledOnce();
  });

  it("still clears the cookie when the upstream session is gone", async () => {
    readSessionCookie.mockResolvedValue("cms-session");
    logoutSession.mockRejectedValue(new Error("revoked"));
    expect((await post()).status).toBe(303);
  });

  it("refuses cross-site posts", async () => {
    const response = await post({ origin: "https://evil.test" });
    expect(response.status).toBe(403);
    expect(logoutSession).not.toHaveBeenCalled();
  });
});
