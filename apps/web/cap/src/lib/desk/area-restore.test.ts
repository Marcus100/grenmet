import { describe, expect, it } from "vitest";
import { gmsCatalogueFixture as catalogue } from "@/test/cap-gms-catalogue.fixture";
import { restoreAreaSelection } from "./area-restore";

describe("restoreAreaSelection", () => {
  it("restores parishes when the picker would build the same area", () => {
    expect(
      restoreAreaSelection(catalogue, [
        {
          area_desc: "Saint Andrew, Saint David",
          geocodes: [
            { value: "GD-01", value_name: "ISO3166-2:GD" },
            { value: "GD-02", value_name: "ISO3166-2:GD" },
          ],
          kind: "GEOCODE",
        },
      ])
    ).toEqual({
      areaDesc: null,
      kind: "GEOCODE",
      parishIds: ["andrew", "david"],
    });
  });

  it("keeps a forecaster's own area description", () => {
    const restored = restoreAreaSelection(catalogue, [
      {
        area_desc: "Eastern Grenada",
        geocodes: [{ value: "GD-01", value_name: "ISO3166-2:GD" }],
        kind: "GEOCODE",
      },
    ]);
    expect(restored).toMatchObject({ areaDesc: "Eastern Grenada" });
  });

  it("restores one circle and one polygon", () => {
    expect(
      restoreAreaSelection(catalogue, [
        {
          area_desc: "Near the airport",
          circles: [{ lat: 12.0, lon: -61.78, radius: 5 }],
          kind: "CIRCLE",
        },
      ])
    ).toEqual({
      areaDesc: "Near the airport",
      circle: { lat: 12, lon: -61.78, radiusKm: 5 },
      kind: "CIRCLE",
    });
    expect(
      restoreAreaSelection(catalogue, [
        {
          area_desc: "Box",
          kind: "POLYGON",
          polygons: [
            [
              [-61.8, 12.0],
              [-61.7, 12.0],
              [-61.7, 12.1],
            ],
          ],
        },
      ])
    ).toMatchObject({ kind: "POLYGON" });
  });

  it.each([
    [
      "several areas",
      [
        { area_desc: "A", kind: "GEOCODE" as const, geocodes: [] },
        { area_desc: "B", kind: "GEOCODE" as const, geocodes: [] },
      ],
    ],
    [
      "an unknown geocode",
      [
        {
          area_desc: "Elsewhere",
          geocodes: [{ value: "XX-99", value_name: "ISO3166-2:GD" }],
          kind: "GEOCODE" as const,
        },
      ],
    ],
    [
      "a height",
      [
        {
          altitude: 100,
          area_desc: "Andrew aloft",
          geocodes: [{ value: "GD-01", value_name: "ISO3166-2:GD" }],
          kind: "GEOCODE" as const,
        },
      ],
    ],
    [
      "a predefined area",
      [
        {
          area_desc: "Coast",
          kind: "AREA" as const,
          predefined_area_id: "8d5c6c1e-0000-4000-8000-000000000000",
        },
      ],
    ],
  ])("keeps %s exactly as saved", (_label, areas) => {
    expect(restoreAreaSelection(catalogue, areas)).toEqual({
      areas,
      kind: "kept",
    });
  });
});
