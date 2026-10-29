import type { PublicObservation } from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { currentConditions } from "@/lib/current-conditions";

const base = {
  station_id: "mbia",
  observed_at: "2026-10-28T12:00:00Z",
  status: "accepted",
  temperature_c: 29,
  wind_calm: false,
  wind_direction: "ESE",
  wind_speed_kt: 12,
  msl_pressure_hpa: 1012.5,
} as PublicObservation;

describe("current conditions", () => {
  it("shows the wind speed once, with no knots companion", () => {
    const wind = currentConditions(base).primary.find(
      (tile) => tile.label === "Wind"
    );
    expect(wind?.measure).toEqual({
      quantity: "speed",
      low: 12,
      prefix: "ESE ",
    });
    expect(wind?.detail).toBeUndefined();
  });

  it("carries the pressure change as a number when the trend is not steady", () => {
    const falling = currentConditions({
      ...base,
      pressure_trend: "falling",
      pressure_change_hpa: -1.2,
    } as PublicObservation);
    expect(falling.pressureChangeHpa).toBe(1.2);
    const pressure = falling.primary.find((tile) => tile.label === "Pressure");
    expect(pressure?.detail).toBe("Falling");
  });

  it("carries no pressure change when the pressure is steady or unknown", () => {
    expect(
      currentConditions({
        ...base,
        pressure_trend: "steady",
        pressure_change_hpa: 0.1,
      } as PublicObservation).pressureChangeHpa
    ).toBeNull();
    expect(currentConditions(base).pressureChangeHpa).toBeNull();
  });
});
