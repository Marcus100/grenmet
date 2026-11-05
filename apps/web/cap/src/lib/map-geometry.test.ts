import { describe, expect, it } from "vitest";
import type { AlertFeature } from "@/lib/cap-api";
import { boundsFor, projectionFor, toShape } from "@/lib/map-geometry";

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
});
