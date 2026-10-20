import { beforeEach, describe, expect, it, vi } from "vitest";

const getVenueQrToken = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const readSessionCookie = vi.hoisted(() => vi.fn());

vi.mock("@/lib/org-rewards", () => ({ getVenueQrToken }));
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/session", () => ({
  exchangeSessionForAccessToken: vi
    .fn()
    .mockResolvedValue({ access_token: "access" }),
  readSessionCookie,
}));

import { GET } from "./route";

const VENUE = "11111111-1111-4111-8111-111111111111";

function call(organisationId = "org_1", venueId = VENUE) {
  return GET(new Request("http://localhost/x"), {
    params: Promise.resolve({ organisationId, venueId }),
  });
}

function apiError(status: number, data: unknown = {}) {
  return Object.assign(new Error(`status ${status}`), { data, status });
}

beforeEach(() => {
  vi.clearAllMocks();
  readSessionCookie.mockResolvedValue("session");
});

describe("GET venue QR token proxy", () => {
  it("relays the code for the organisation and venue, and is never cached", async () => {
    getVenueQrToken.mockResolvedValue({
      refresh_after_seconds: 30,
      token: "v1.abc.1.def",
      window_seconds: 60,
    });
    const response = await call();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(await response.json()).toEqual({
      refresh_after_seconds: 30,
      token: "v1.abc.1.def",
      window_seconds: 60,
    });
    expect(getVenueQrToken).toHaveBeenCalledWith("access", "org_1", VENUE);
  });

  it("is dynamic so Next never prerenders or caches it", async () => {
    const route = await import("./route");
    expect(route.dynamic).toBe("force-dynamic");
  });

  it("answers 401 without a session and doesn't call the API", async () => {
    readSessionCookie.mockResolvedValue(null);
    const response = await call();
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
    expect(getVenueQrToken).not.toHaveBeenCalled();
  });

  it("rejects ids of the wrong shape with 400", async () => {
    expect((await call("org_1", "not-a-uuid")).status).toBe(400);
    expect((await call("../etc", VENUE)).status).toBe(400);
    expect(getVenueQrToken).not.toHaveBeenCalled();
  });

  it.each([
    [403, 403],
    [404, 404],
    [401, 401],
  ])("passes API %i through as %i with no-store", async (status, expected) => {
    getVenueQrToken.mockRejectedValue(apiError(status, { detail: "x" }));
    const response = await call();
    expect(response.status).toBe(expected);
    expect(response.headers.get("Cache-Control")).toContain("no-store");
  });

  it("answers 502 and reports an unexpected failure without leaking it", async () => {
    const failure = apiError(500, { detail: "secret internals" });
    getVenueQrToken.mockRejectedValue(failure);
    const response = await call();
    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "unavailable" });
    expect(reportError).toHaveBeenCalledWith(failure, "org-rewards-qr-token");
  });
});
