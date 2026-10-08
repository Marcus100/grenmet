import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ fetch: vi.fn(), cookie: vi.fn() }));
vi.mock("@barrelsgd/auth/server", () => ({
  authApiFetch: mocks.fetch,
  writeSessionCookie: mocks.cookie,
}));
vi.mock("@/lib/auth-config", () => ({
  authConfig: {},
  APP_AUTH_PATH: "/auth/apps/events",
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

import { POST } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.fetch.mockResolvedValue({
    session_token: "opaque",
    session_expires_at: "2026-11-01T00:00:00Z",
  });
});
it("forwards the optional enrolled factor and writes the resulting session", async () => {
  const body = {
    email: "person@example.com",
    code: "123456",
    totp_code: "RECOVERY-CODE",
  };
  const response = await POST(
    new Request("http://localhost/auth/email-code/verify", {
      method: "POST",
      body: JSON.stringify(body),
    })
  );
  expect(response.status).toBe(200);
  expect(mocks.fetch).toHaveBeenCalledWith(
    {},
    "/auth/apps/events/email-code/verify",
    expect.anything(),
    { body, method: "POST" }
  );
  expect(mocks.cookie).toHaveBeenCalledWith(
    {},
    "opaque",
    "2026-11-01T00:00:00Z"
  );
});
it("rejects an oversized factor before calling the auth API", async () => {
  const response = await POST(
    new Request("http://localhost/auth/email-code/verify", {
      method: "POST",
      body: JSON.stringify({
        email: "person@example.com",
        code: "123456",
        totp_code: "X".repeat(65),
      }),
    })
  );
  expect(response.status).toBe(400);
  expect(mocks.fetch).not.toHaveBeenCalled();
  expect(mocks.cookie).not.toHaveBeenCalled();
});
