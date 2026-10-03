import { beforeEach, describe, expect, it, vi } from "vitest";

const checks = vi.hoisted(() => ({
  weather: vi.fn(),
  imagery: vi.fn(),
  apiReady: vi.fn(),
}));
vi.mock("@/db/wxproducts/authored-queries", () => ({
  listPublishedProducts: checks.weather,
}));
vi.mock("@/db/wxwatch/queries", () => ({ checkImageryReady: checks.imagery }));
vi.mock("@/lib/auth-config", () => ({
  getAuthApiBaseUrl: () => "http://api.test",
  getAuthApiPrefix: () => "/api/v1",
}));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  checks.imagery.mockResolvedValue(true);
  checks.weather.mockResolvedValue([]);
  checks.apiReady.mockResolvedValue(new Response(null, { status: 200 }));
  vi.stubGlobal("fetch", checks.apiReady);
});

describe("readiness after weather database handover", () => {
  it("accepts an empty weather feed and a ready FastAPI service", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(checks.weather).toHaveBeenCalledOnce();
    expect(checks.apiReady).toHaveBeenCalledOnce();
    expect(checks.apiReady.mock.calls[0][0].href).toBe(
      "http://api.test/api/v1/utils/ready/"
    );
    expect(checks.apiReady.mock.calls[0][1]).toMatchObject({
      cache: "no-store",
      redirect: "error",
    });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("fails readiness when FastAPI weather storage is unavailable", async () => {
    checks.weather.mockRejectedValue(new Error("private connection detail"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });

  it("fails when the FastAPI readiness endpoint is unavailable", async () => {
    checks.apiReady.mockResolvedValueOnce(new Response(null, { status: 503 }));
    expect((await GET()).status).toBe(503);
  });
});
