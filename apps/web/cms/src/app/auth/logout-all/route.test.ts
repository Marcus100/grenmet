import { afterEach, describe, expect, it, vi } from "vitest";

const readSessionCookie = vi.hoisted(() => vi.fn());
const logoutAllSessions = vi.hoisted(() => vi.fn());
vi.mock("../../../lib/auth-config", () => ({
  getAuthConfig: () => ({ authAppUrl: "https://auth.barrels.test" }),
}));
vi.mock("@barrelsgd/auth/server", () => ({
  clearSessionCookieOnResponse: vi.fn(),
  logoutAllSessions,
  readSessionCookie,
}));

import { POST } from "./route";

afterEach(() => vi.resetAllMocks());

describe("POST /auth/logout-all", () => {
  it("ends every session and lands on the signed-out-everywhere page", async () => {
    readSessionCookie.mockResolvedValue("cms-session");
    const response = await POST(
      new Request("https://cms.barrels.test/auth/logout-all", {
        method: "POST",
      })
    );
    expect(logoutAllSessions).toHaveBeenCalledWith(
      { authAppUrl: "https://auth.barrels.test" },
      "cms-session"
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      "https://auth.barrels.test/signed-out?all=1"
    );
  });
});
