import { describe, expect, it } from "vitest";
import {
  buildCircleArea,
  buildGeocodeArea,
  buildPolygonArea,
  circleToRingCoordinates,
  parishNames,
} from "./cap-areas";

describe("buildGeocodeArea", () => {
  it("returns null when no parishes are selected", () => {
    expect(buildGeocodeArea([])).toBeNull();
  });

  it("builds one geocode per parish with a human-readable areaDesc", () => {
    const area = buildGeocodeArea(["andrew", "david"]);
    expect(area).toEqual({
      kind: "GEOCODE",
      area_desc: "Saint Andrew, Saint David",
      geocodes: [
        { value_name: "ISO3166-2:GD", value: "GD-01" },
        { value_name: "ISO3166-2:GD", value: "GD-02" },
      ],
    });
  });

  it("uses the real ISO 3166-2:GD dependency code for Carriacou & Petite Martinique", () => {
    const area = buildGeocodeArea(["carriacou-pm"]);
    expect(area?.geocodes).toEqual([
      { value_name: "ISO3166-2:GD", value: "GD-10" },
    ]);
  });

  it("silently drops unknown parish ids rather than throwing", () => {
    const area = buildGeocodeArea(["andrew", "not-a-real-parish"]);
    expect(area?.geocodes).toHaveLength(1);
  });
});

describe("parishNames", () => {
  it("preserves selection order and drops unknown ids", () => {
    expect(parishNames(["mark", "andrew", "nope"])).toEqual([
      "Saint Mark",
      "Saint Andrew",
    ]);
  });
});

describe("buildCircleArea", () => {
  it("carries lat/lon/radius as CAP's native circle representation", () => {
    const area = buildCircleArea(
      { lat: 12.3, lon: -61.64, radiusKm: 5 },
      "5 km radius near Kick 'em Jenny"
    );
    expect(area).toEqual({
      kind: "CIRCLE",
      area_desc: "5 km radius near Kick 'em Jenny",
      circles: [{ lat: 12.3, lon: -61.64, radius: 5 }],
    });
  });
});

describe("buildPolygonArea", () => {
  it("requires at least three points", () => {
    expect(
      buildPolygonArea(
        [
          [-61.7, 12.1],
          [-61.6, 12.1],
        ],
        "too small"
      )
    ).toBeNull();
  });

  it("builds a single-ring polygon from [lon, lat] points", () => {
    const area = buildPolygonArea(
      [
        [-61.7, 12.1],
        [-61.6, 12.1],
        [-61.65, 12.2],
      ],
      "Custom catchment"
    );
    expect(area).toEqual({
      kind: "POLYGON",
      area_desc: "Custom catchment",
      polygons: [
        [
          [-61.7, 12.1],
          [-61.6, 12.1],
          [-61.65, 12.2],
        ],
      ],
    });
  });
});

describe("circleToRingCoordinates", () => {
  it("returns a closed ring roughly centred on the circle", () => {
    const ring = circleToRingCoordinates(
      { lat: 12.3, lon: -61.64, radiusKm: 5 },
      8
    );
    expect(ring).toHaveLength(9); // steps + 1 to close the ring
    const first = ring[0];
    const last = ring.at(-1);
    expect(first[0]).toBeCloseTo(last?.[0] ?? Number.NaN, 6);
    expect(first[1]).toBeCloseTo(last?.[1] ?? Number.NaN, 6);
    // every point stays within a small margin of the requested radius (~0.045deg lat per 5km)
    for (const [lon, lat] of ring) {
      expect(Math.abs(lat - 12.3)).toBeLessThan(0.06);
      expect(Math.abs(lon - -61.64)).toBeLessThan(0.06);
    }
  });
});
