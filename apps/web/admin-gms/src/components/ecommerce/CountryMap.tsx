"use client";

import {
  ComposableMap,
  Geographies,
  Geography,
  Marker,
} from "react-simple-maps";

const GEO_URL =
  "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json";

const MARKERS: { name: string; coords: [number, number] }[] = [
  { name: "United States", coords: [-104.657, 37.258] },
  { name: "India", coords: [73.728, 20.75] },
  { name: "United Kingdom", coords: [-11.637, 53.613] },
  { name: "Australia", coords: [115.209, -25.03] },
];

interface CountryMapProps {
  mapColor?: string;
}

export default function CountryMap({
  mapColor = "var(--gm-border)",
}: CountryMapProps) {
  return (
    <ComposableMap>
      <Geographies geography={GEO_URL}>
        {({ geographies }) =>
          geographies.map((geo) => (
            <Geography
              geography={geo}
              key={geo.rsmKey}
              stroke="none"
              style={{
                default: { fill: mapColor, outline: "none" },
                hover: {
                  fill: "var(--gm-blue)",
                  outline: "none",
                  cursor: "pointer",
                },
                pressed: { fill: "var(--gm-blue)", outline: "none" },
              }}
            />
          ))
        }
      </Geographies>
      {MARKERS.map(({ name, coords }) => (
        <Marker coordinates={coords} key={name}>
          <circle r={4} style={{ fill: "var(--gm-blue)" }} />
        </Marker>
      ))}
    </ComposableMap>
  );
}
