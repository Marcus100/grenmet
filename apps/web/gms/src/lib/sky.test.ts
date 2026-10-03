import { describe, expect, it } from "vitest";
import { moonPhase, sunTimes } from "./sky";

const ast = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Grenada",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

describe("sunTimes for Grenada", () => {
  it("matches the GMS forecast sheet of 29 Sep 2026 within a few minutes", () => {
    const { sunrise, sunset } = sunTimes("2026-09-29");
    // Issued forecast: sunrise 05:58, sunset 17:56 AST.
    expect(
      Math.abs(minutes(ast(sunrise)) - minutes("05:58"))
    ).toBeLessThanOrEqual(5);
    expect(
      Math.abs(minutes(ast(sunset)) - minutes("17:56"))
    ).toBeLessThanOrEqual(5);
  });
  it("keeps days near twelve hours all year at 12°N", () => {
    for (const day of ["2026-06-21", "2026-12-21"]) {
      const { sunrise, sunset } = sunTimes(day);
      const hours = (sunset.getTime() - sunrise.getTime()) / 3_600_000;
      expect(hours).toBeGreaterThan(11.1);
      expect(hours).toBeLessThan(12.9);
    }
    const june = sunTimes("2026-06-21");
    const december = sunTimes("2026-12-21");
    expect(june.sunset.getTime() - june.sunrise.getTime()).toBeGreaterThan(
      december.sunset.getTime() - december.sunrise.getTime()
    );
  });
});

describe("moonPhase", () => {
  it("names known full and new moons", () => {
    // Partial lunar eclipse full moon; annular solar eclipse new moon.
    const full = moonPhase(new Date("2024-09-18T02:34:00Z"));
    expect(full.name).toBe("Full moon");
    expect(full.illumination).toBeGreaterThan(0.98);
    const fresh = moonPhase(new Date("2024-10-02T18:49:00Z"));
    expect(fresh.name).toBe("New moon");
    expect(fresh.illumination).toBeLessThan(0.02);
  });
  it("waxes between new and full", () => {
    expect(moonPhase(new Date("2024-09-26T00:00:00Z")).name).toBe(
      "Last quarter"
    );
    expect(moonPhase(new Date("2024-10-10T12:00:00Z")).name).toBe(
      "First quarter"
    );
  });
});
