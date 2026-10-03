import { beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cookie: vi.fn(),
  exchange: vi.fn(),
  request: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server-session", () => ({
  readSessionCookie: mocks.cookie,
  exchangeSessionForAccessToken: mocks.exchange,
  authApiFetch: mocks.request,
}));

import { loadCapAudit, loadCapSettings } from "./queries";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookie.mockResolvedValue("opaque");
  mocks.exchange.mockResolvedValue({ access_token: "scoped-token" });
});
it("exchanges the session and bypasses caching for CAP reads", async () => {
  await loadCapSettings();
  expect(mocks.exchange).toHaveBeenCalledWith("opaque");
  expect(mocks.request).toHaveBeenCalledWith(
    "/cap/settings",
    expect.anything(),
    { accessToken: "scoped-token", cache: "no-store" }
  );
});
it("forwards the audit filter as query data", async () => {
  await loadCapAudit(2, "id&size=500");
  expect(mocks.request.mock.calls[0][0]).toBe(
    "/cap/audit?page=2&size=25&alert_id=id%26size%3D500"
  );
});
it("does not request CAP data without a session", async () => {
  mocks.cookie.mockResolvedValue(null);
  await expect(loadCapSettings()).rejects.toMatchObject({
    message: "Sign in to use CAP administration.",
  });
  expect(mocks.request).not.toHaveBeenCalled();
});
