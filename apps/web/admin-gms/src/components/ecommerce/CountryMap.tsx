// import { VectorMap } from "@react-jvectormap/core";
import { worldMill } from "@react-jvectormap/world";
import dynamic from "next/dynamic";
import type React from "react";

const VectorMap = dynamic(
  () => import("@react-jvectormap/core").then((mod) => mod.VectorMap),
  { ssr: false }
);

// Define the component props
interface CountryMapProps {
  mapColor?: string;
}

type MarkerStyle = {
  initial: {
    fill: string;
    r: number; // Radius for markers
  };
};

type Marker = {
  latLng: [number, number];
  name: string;
  style?: {
    fill: string;
    borderWidth: number;
    borderColor: string;
    stroke?: string;
    strokeOpacity?: number;
  };
};

const CountryMap: React.FC<CountryMapProps> = ({ mapColor }) => {
  return (
    <VectorMap
      backgroundColor="transparent"
      map={worldMill}
      markerStyle={
        {
          initial: {
            fill: "#465FFF",
            r: 4, // Custom radius for markers
          }, // Type assertion to bypass strict CSS property checks
        } as MarkerStyle
      }
      markers={
        [
          {
            latLng: [37.258_039_7, -104.657_039],
            name: "United States",
            style: {
              fill: "#465FFF",
              borderWidth: 1,
              borderColor: "white",
              stroke: "#383f47",
            },
          },
          {
            latLng: [20.750_437_4, 73.727_610_5],
            name: "India",
            style: { fill: "#465FFF", borderWidth: 1, borderColor: "white" },
          },
          {
            latLng: [53.613, -11.6368],
            name: "United Kingdom",
            style: { fill: "#465FFF", borderWidth: 1, borderColor: "white" },
          },
          {
            latLng: [-25.030_438_8, 115.209_276_1],
            name: "Sweden",
            style: {
              fill: "#465FFF",
              borderWidth: 1,
              borderColor: "white",
              strokeOpacity: 0,
            },
          },
        ] as Marker[]
      }
      markersSelectable={true}
      regionLabelStyle={{
        initial: {
          fill: "#35373e",
          fontWeight: 500,
          fontSize: "13px",
          stroke: "none",
        },
        hover: {},
        selected: {},
        selectedHover: {},
      }}
      regionStyle={{
        initial: {
          fill: mapColor || "#D0D5DD",
          fillOpacity: 1,
          fontFamily: "Outfit",
          stroke: "none",
          strokeWidth: 0,
          strokeOpacity: 0,
        },
        hover: {
          fillOpacity: 0.7,
          cursor: "pointer",
          fill: "#465fff",
          stroke: "none",
        },
        selected: {
          fill: "#465FFF",
        },
        selectedHover: {},
      }}
      zoomAnimate={true}
      zoomMax={12}
      zoomMin={1}
      zoomOnScroll={false}
      zoomStep={1.5}
    />
  );
};

export default CountryMap;
