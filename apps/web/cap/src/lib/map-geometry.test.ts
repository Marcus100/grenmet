import { describe, expect, it } from "vitest";
import type { AlertFeature } from "@/lib/cap-api";
import {
  boundsFor,
  landPath,
  projectionFor,
  toShape,
} from "@/lib/map-geometry";

const PATH = /^M.*Z$/u;
const props = { identifier: "a", severity: "Severe" };

describe("map geometry", () => {
  it("always covers the three islands", () => {
    const bounds = boundsFor([]);
    expect(bounds.west).toBeLessThanOrEqual(-61.8);
    expect(bounds.north).toBeGreaterThanOrEqual(12.5);
  });

  it("draws a polygon and maps severity to a level", () => {
    const feature: AlertFeature = {
      geometry: {
        coordinates: [
          [
            [-61.8, 12.0],
            [-61.6, 12.0],
            [-61.6, 12.2],
          ],
        ],
        type: "Polygon",
      },
      properties: props,
    };
    const projection = projectionFor(boundsFor([feature]));
    const shape = toShape(feature, projection);
    expect(shape.d).toMatch(PATH);
    expect(shape.level).toBe("take-action");
    expect(shape.label).not.toBeNull();
  });

  it("returns an empty shape when there is no geometry", () => {
    const projection = projectionFor(boundsFor([]));
    const shape = toShape({ geometry: null, properties: props }, projection);
    expect(shape.d).toBeNull();
    expect(shape.label).toBeNull();
  });

  it("draws every parish as land, inside the map", () => {
    const projection = projectionFor(boundsFor([]));
    const d = landPath(projection);
    // Seven subdivisions, each at least one closed ring.
    expect(d.match(/M/gu)?.length).toBeGreaterThanOrEqual(7);
    expect(d.match(/Z/gu)?.length).toBe(d.match(/M/gu)?.length);
    const numbers = d.match(/-?\d+(\.\d+)?/gu)?.map(Number) ?? [];
    const xs = numbers.filter((_, index) => index % 2 === 0);
    const ys = numbers.filter((_, index) => index % 2 === 1);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...xs)).toBeLessThanOrEqual(projection.width);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...ys)).toBeLessThanOrEqual(projection.height);
  });
});
