import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: { AUTH_API_URL: "http://api.example.test", AUTH_API_V1_STR: "/api/v1" },
}));

import { dayRange, fetchPublicTides, grenadaDay } from "@/lib/almanac";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

describe("Grenada day helpers", () => {
  it("reads the calendar day in Grenada time, not UTC", () => {
    // 03:00 UTC on 10 Nov is still 9 Nov in Grenada (UTC-4).
    expect(grenadaDay(new Date("2026-11-10T03:00:00Z"))).toBe("2026-11-09");
    expect(grenadaDay(new Date("2026-11-10T04:30:00Z"))).toBe("2026-11-10");
  });

  it("lists consecutive days across a month end", () => {
    expect(dayRange("2026-11-28", 4)).toEqual([
      "2026-11-28",
      "2026-11-29",
      "2026-11-30",
      "2026-12-01",
    ]);
  });
});

describe("fetchPublicTides", () => {
  it("reads the public tide endpoint for Prickly Bay and the window", async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ station: "pric", name: "Prickly Bay", events: [] }),
        { status: 200 }
      )
    );

    const result = await fetchPublicTides("2026-11-09", "2026-11-15");

    expect(result.status).toBe("ok");
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.pathname).toBe("/api/v1/almanac/public/tides");
    expect(url.searchParams.get("station")).toBe("pric");
    expect(url.searchParams.get("from")).toBe("2026-11-09");
    expect(url.searchParams.get("to")).toBe("2026-11-15");
  });

  it("is unavailable, not empty, when the API fails", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 503 }));

    await expect(fetchPublicTides("2026-11-09", "2026-11-15")).resolves.toEqual(
      {
        status: "unavailable",
      }
    );
  });

  it("is unavailable when the body does not match the contract", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ unexpected: true }), { status: 200 })
    );

    await expect(fetchPublicTides("2026-11-09", "2026-11-15")).resolves.toEqual(
      {
        status: "unavailable",
      }
    );
  });
});
