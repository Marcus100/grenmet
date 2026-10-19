import { describe, expect, it } from "vitest";
import {
  compass,
  linePath,
  localMidnights,
  niceAxis,
  scaleLinear,
} from "@/lib/chart";

describe("scaleLinear", () => {
  it("maps the domain onto the range", () => {
    const scale = scaleLinear([0, 10], [100, 0]);
    expect(scale(0)).toBe(100);
    expect(scale(10)).toBe(0);
    expect(scale(5)).toBe(50);
  });

  it("centres a degenerate domain", () => {
    expect(scaleLinear([3, 3], [0, 10])(3)).toBe(5);
  });
});

describe("niceAxis", () => {
  it("returns null without data", () => {
    expect(niceAxis([null, null])).toBeNull();
  });

  it("covers the data with rounded ticks", () => {
    const axis = niceAxis([24.2, 30.7, null, 27]);
    expect(axis).not.toBeNull();
    expect(axis?.min).toBeLessThanOrEqual(24.2);
    expect(axis?.max).toBeGreaterThanOrEqual(30.7);
    expect(axis?.ticks[0]).toBe(axis?.min);
    expect(axis?.ticks.at(-1)).toBe(axis?.max);
  });

  it("starts bars at zero and keeps a minimum span", () => {
    const axis = niceAxis([0, 0.2], { floorZero: true, minSpan: 2 });
    expect(axis?.min).toBe(0);
    expect(axis?.max).toBeGreaterThanOrEqual(2);
  });
});

describe("linePath", () => {
  it("lifts the pen across gaps", () => {
    const id = (v: number) => v;
    expect(linePath([0, 1, 2, 3], [1, 2, null, 4], id, id)).toBe(
      "M0.0 1.0L1.0 2.0M3.0 4.0"
    );
  });
});

describe("localMidnights", () => {
  it("finds 04:00 UTC, which is midnight in Grenada", () => {
    const start = Date.UTC(2026, 9, 18, 0);
    const end = Date.UTC(2026, 9, 20, 12);
    expect(localMidnights(start, end)).toEqual([
      Date.UTC(2026, 9, 18, 4),
      Date.UTC(2026, 9, 19, 4),
      Date.UTC(2026, 9, 20, 4),
    ]);
  });
});

describe("compass", () => {
  it("names the direction the wind comes from", () => {
    expect(compass(0)).toBe("N");
    expect(compass(90)).toBe("E");
    expect(compass(217)).toBe("SW");
    expect(compass(359)).toBe("N");
  });
});
