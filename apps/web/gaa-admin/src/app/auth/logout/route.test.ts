vi.mock("server-only", () => ({}));

import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/server-session", () => ({
  readSessionCookie: vi.fn().mockResolvedValue(null),
  logoutSession: vi.fn(),
  clearSessionCookieOnResponse: vi.fn(),
}));

import { POST } from "./route";

describe("logout redirects", () => {
  it.each(["admin.barrels.gd", "admin.staging.barrels.gd"])(
    "returns the public HTTPS origin behind the proxy: %s",
    async (host) => {
      const response = await POST(
        new Request("http://web-admin:3001/auth/logout", {
          method: "POST",
          headers: {
            accept: "text/html",
            "x-forwarded-host": host,
            "x-forwarded-proto": "https",
          },
        })
      );
      expect(response.headers.get("location")).toBe(`https://${host}/signin`);
    }
  );
  it("keeps the local origin in development", async () => {
    const response = await POST(
      new Request("http://localhost:3001/auth/logout", {
        method: "POST",
        headers: { accept: "text/html" },
      })
    );
    expect(response.headers.get("location")).toBe(
      "http://localhost:3001/signin"
    );
  });
});
