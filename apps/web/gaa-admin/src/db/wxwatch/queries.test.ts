import { afterEach, beforeEach, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ cookie: vi.fn(), fetch: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server-session", () => ({ readSessionCookie: mocks.cookie }));
vi.mock("@/lib/auth-config", () => ({
  getAuthApiBaseUrl: () => "http://api.test",
  getAuthApiPrefix: () => "/api/v1",
  getSessionCookieName: () => "session",
}));

import { checkImageryReady, getImagesByDateAndSynoptic } from "./queries";

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal("fetch", mocks.fetch);
  mocks.cookie.mockResolvedValue("opaque-secret");
});
afterEach(() => vi.unstubAllGlobals());
it("uses the UTC day and forwards the session only to the configured API", async () => {
  mocks.fetch.mockResolvedValue(Response.json({ groups: [] }));
  expect(
    await getImagesByDateAndSynoptic(new Date("2026-09-17T23:00:00-04:00"))
  ).toEqual([]);
  expect(String(mocks.fetch.mock.calls[0][0])).toBe(
    "http://api.test/api/v1/wxwatch/metadata?day=2026-09-18"
  );
  expect(mocks.fetch.mock.calls[0][1]).toMatchObject({
    headers: { Cookie: "session=opaque-secret" },
    cache: "no-store",
    redirect: "error",
  });
});
it("does not fetch private metadata without a session", async () => {
  mocks.cookie.mockResolvedValue(null);
  await expect(getImagesByDateAndSynoptic(new Date())).rejects.toThrow(
    "Sign in"
  );
  expect(mocks.fetch).not.toHaveBeenCalled();
});
it("distinguishes unavailable storage from an empty gallery", async () => {
  mocks.fetch.mockResolvedValue(new Response(null, { status: 503 }));
  await expect(getImagesByDateAndSynoptic(new Date())).rejects.toThrow(
    "unavailable"
  );
  expect(await checkImageryReady()).toBe(false);
});
it("readiness needs no user credentials", async () => {
  mocks.fetch.mockResolvedValue(new Response(null, { status: 204 }));
  expect(await checkImageryReady()).toBe(true);
  expect(mocks.fetch.mock.calls[0][1]).not.toHaveProperty("headers");
  expect(mocks.cookie).not.toHaveBeenCalled();
});

it("forwards archive filters and validates the generated response", async () => {
  const { getArchive, getArchiveHistory } = await import("./queries");
  mocks.fetch.mockResolvedValue(
    Response.json({ items: [], has_more: false, offset: 30 })
  );
  const params = new URLSearchParams({ source: "sfcana", offset: "30" });
  expect((await getArchive(params)).offset).toBe(30);
  expect(String(mocks.fetch.mock.calls[0][0])).toContain(
    "/wxwatch/archive?source=sfcana&offset=30"
  );
  mocks.fetch.mockResolvedValue(
    Response.json({ items: [], has_more: false, offset: 30 })
  );
  await getArchiveHistory("edition-id", "30");
  expect(String(mocks.fetch.mock.calls[1][0])).toContain(
    "/archive/edition-id/retrievals?offset=30"
  );
  mocks.fetch.mockResolvedValue(new Response(null, { status: 422 }));
  await expect(getArchive(params)).rejects.toThrow("Invalid archive filters");
});
