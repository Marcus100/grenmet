import type { FlightBoardResponse } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { SAMPLE_FLIGHTS } from "@/lib/flights";

const fetchMock = vi.fn();
vi.mock("@barrelsgd/api-client", () => ({
  flightsGetFlightBoard: (...args: unknown[]) => ({
    unwrap: () => fetchMock(...args),
  }),
}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/env", () => ({ env: { AUTH_API_URL: "http://api.test" } }));

const { loadFlightData, mapBoardResponse } = await import("@/lib/live-flights");

const response = (
  overrides: Partial<FlightBoardResponse>
): FlightBoardResponse => ({
  airport: "TGPY",
  available: true,
  board: "arrivals",
  fetched_at: "2026-10-18T12:00:00Z",
  is_sample: false,
  rows: [
    {
      board: "arrivals",
      callsign: "AAL1509",
      icao24: "a1b2c3",
      other_airport_icao: "KMIA",
      time: "2026-10-17T16:00:00Z",
    },
    {
      board: "arrivals",
      callsign: null,
      icao24: "4ca123",
      other_airport_icao: null,
      time: "2026-10-17T18:00:00Z",
    },
  ],
  source: "opensky",
  ...overrides,
});

describe("mapBoardResponse", () => {
  it("maps rows to flights in Grenada local time", () => {
    const [first, second] = mapBoardResponse(response({}), "arrivals");
    expect(first).toMatchObject({
      airport: "GND",
      cityCode: "KMIA",
      flightNumber: "AAL1509",
      scheduled: "17 Oct 12:00",
      status: "landed",
    });
    expect(second).toMatchObject({
      city: "Unknown",
      flightNumber: "4ca123",
    });
  });

  it("marks departures as departed", () => {
    const [row] = mapBoardResponse(response({}), "departures");
    expect(row?.status).toBe("departed");
  });
});

describe("loadFlightData", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("falls back to the labelled sample when unavailable", async () => {
    fetchMock.mockResolvedValue(response({ available: false, rows: [] }));
    const data = await loadFlightData();
    expect(data.source).toBe("sample");
    expect(data.flights).toBe(SAMPLE_FLIGHTS);
  });

  it("falls back to the sample when the API errors", async () => {
    fetchMock.mockRejectedValue(new Error("down"));
    const data = await loadFlightData();
    expect(data.source).toBe("sample");
  });

  it("uses live rows when the API has them", async () => {
    fetchMock.mockImplementation(({ query }: { query: { board: string } }) =>
      Promise.resolve(
        query.board === "arrivals"
          ? response({})
          : response({ available: false, rows: [] })
      )
    );
    const data = await loadFlightData();
    expect(data.source).toBe("opensky");
    expect(data.fetchedAt).toBe("2026-10-18T12:00:00Z");
    expect(data.flights).toHaveLength(2);
    expect(data.flights.every((f) => f.board === "arrivals")).toBe(true);
  });
});
