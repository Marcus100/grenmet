import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookie: vi.fn(),
  exchange: vi.fn(),
  client: vi.fn(),
  security: vi.fn(),
}));
vi.mock("@barrelsgd/auth/server", () => ({ getEffectiveAccess: vi.fn() }));
vi.mock("@barrelsgd/api-client", () => ({
  createClient: mocks.client,
  authGetAccountSecurity: mocks.security,
  authReplaceRecoveryCodes: vi.fn(),
  authRevokeSecuritySession: vi.fn(),
  authTwofaActivate: vi.fn(),
  authTwofaDisable: vi.fn(),
  authTwofaSetup: vi.fn(),
  authUpdatePasswordMe: vi.fn(),
}));
vi.mock("@/lib/auth-config", () => ({
  getAuthConfig: () => ({
    authApiBaseUrl: "http://api",
    authApiPrefix: "/api/v1",
  }),
}));
vi.mock("@/lib/session", () => ({
  clearSessionCookie: vi.fn(),
  readSessionCookie: mocks.cookie,
  exchangeSessionForAccessToken: mocks.exchange,
}));

import { loadSecurity } from "./actions";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.cookie.mockResolvedValue("owned-session");
  mocks.client.mockImplementation(() => ({
    interceptors: { request: { use: vi.fn() }, error: { use: vi.fn() } },
  }));
  mocks.security.mockReturnValue({
    unwrap: () => Promise.resolve({ totp_enabled: true }),
  });
});
it("reports session proof separately from enrolment and uses only that session's token", async () => {
  mocks.exchange.mockResolvedValueOnce({
    access_token: "first-user-token",
    session: { mfa_verified_at: null },
  });
  expect((await loadSecurity()).current_session_mfa_verified).toBe(false);
  mocks.exchange.mockResolvedValueOnce({
    access_token: "second-user-token",
    session: { mfa_verified_at: "2026-10-07T12:00:00Z" },
  });
  expect((await loadSecurity()).current_session_mfa_verified).toBe(true);
  expect(mocks.exchange).toHaveBeenCalledTimes(2);
  expect(
    mocks.client.mock.calls.map(([config]) => config.headers.Authorization)
  ).toEqual(["Bearer first-user-token", "Bearer second-user-token"]);
});
