import { beforeEach, describe, expect, it, vi } from "vitest";

const checks = vi.hoisted(() => ({
  database: vi.fn(),
  weather: vi.fn(),
  imagery: vi.fn(),
}));
vi.mock("@/db/readiness", () => ({ checkDatabase: checks.database }));
vi.mock("@/db/wxproducts/authored-queries", () => ({
  listPublishedProducts: checks.weather,
}));
vi.mock("@/env", () => ({
  env: {
    WXWATCH_DATABASE_URL: "wxwatch",
    TRANSPORT_DATABASE_URL: "transport",
    JANITORIAL_DATABASE_URL: "janitorial",
  },
}));

vi.mock("@/db/wxwatch/queries", () => ({ checkImageryReady: checks.imagery }));

import { GET } from "./route";

beforeEach(() => {
  vi.clearAllMocks();
  checks.database.mockResolvedValue(true);
  checks.imagery.mockResolvedValue(true);
  checks.weather.mockResolvedValue([]);
});

describe("readiness after weather database handover", () => {
  it("accepts an empty weather feed and only connects to unmigrated databases", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(checks.database.mock.calls.map(([url]) => url)).toEqual([
      "transport",
      "janitorial",
    ]);
    expect(checks.weather).toHaveBeenCalledOnce();
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
  it("fails readiness when FastAPI weather storage is unavailable", async () => {
    checks.weather.mockRejectedValue(new Error("private connection detail"));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ status: "unavailable" });
  });
  it("still fails when an unmigrated domain database is unavailable", async () => {
    checks.database.mockResolvedValueOnce(false);
    expect((await GET()).status).toBe(503);
  });
});
