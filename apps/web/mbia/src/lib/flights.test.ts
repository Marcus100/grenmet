import { describe, expect, it } from "vitest";
import {
  type Flight,
  flightsFor,
  isAirportCode,
  isBoard,
  SAMPLE_FLIGHTS,
} from "@/lib/flights";

const make = (overrides: Partial<Flight>): Flight => ({
  airline: "Test Air",
  flightNumber: "TA 100",
  city: "Testville",
  cityCode: "TST",
  airport: "GND",
  board: "arrivals",
  scheduled: "12:00",
  status: "scheduled",
  ...overrides,
});

describe("flightsFor", () => {
  it("filters by airport and board", () => {
    const flights = [
      make({ airport: "GND", board: "arrivals" }),
      make({ airport: "GND", board: "departures" }),
      make({ airport: "CRU", board: "arrivals" }),
    ];
    const result = flightsFor(flights, "GND", "arrivals");
    expect(result).toHaveLength(1);
    expect(result[0]?.airport).toBe("GND");
    expect(result[0]?.board).toBe("arrivals");
  });

  it("sorts by scheduled time", () => {
    const flights = [
      make({ scheduled: "15:30" }),
      make({ scheduled: "08:05" }),
      make({ scheduled: "12:45" }),
    ];
    expect(
      flightsFor(flights, "GND", "arrivals").map((f) => f.scheduled)
    ).toEqual(["08:05", "12:45", "15:30"]);
  });

  it("returns rows for every sample board", () => {
    for (const airport of ["GND", "CRU"] as const) {
      for (const board of ["arrivals", "departures"] as const) {
        expect(
          flightsFor(SAMPLE_FLIGHTS, airport, board).length
        ).toBeGreaterThan(0);
      }
    }
  });
});

describe("type guards", () => {
  it("isBoard accepts only board values", () => {
    expect(isBoard("arrivals")).toBe(true);
    expect(isBoard("departures")).toBe(true);
    expect(isBoard("lounge")).toBe(false);
    expect(isBoard(undefined)).toBe(false);
  });

  it("isAirportCode accepts only known codes", () => {
    expect(isAirportCode("GND")).toBe(true);
    expect(isAirportCode("CRU")).toBe(true);
    expect(isAirportCode("JFK")).toBe(false);
    expect(isAirportCode(undefined)).toBe(false);
  });
});
