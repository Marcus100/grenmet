import { beforeEach, expect, it, vi } from "vitest";
import {
  clearSessionCookieOnResponse,
  logoutSession,
  readSessionCookie,
} from "@/lib/server-session";
import { POST } from "./route";

vi.mock("@/lib/server-session", () => ({
  clearSessionCookieOnResponse: vi.fn(),
  logoutSession: vi.fn(),
  readSessionCookie: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(readSessionCookie).mockResolvedValue("test-session");
});
it("redirects a logout form to sign-in and clears the browser cookie", async () => {
  const response = await POST(
    new Request("http://localhost:3001/auth/logout", {
      method: "POST",
      headers: { accept: "text/html" },
    })
  );
  expect(logoutSession).toHaveBeenCalledWith("test-session");
  expect(clearSessionCookieOnResponse).toHaveBeenCalledWith(response);
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("http://localhost:3001/signin");
});
it("still clears the cookie when the upstream session is unavailable", async () => {
  vi.mocked(logoutSession).mockRejectedValueOnce(new Error("Unavailable"));
  const response = await POST(
    new Request("http://localhost:3001/auth/logout", { method: "POST" })
  );
  expect(clearSessionCookieOnResponse).toHaveBeenCalledWith(response);
  expect(await response.json()).toEqual({ ok: true });
});
