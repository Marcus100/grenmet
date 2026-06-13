"use client";
// import Chart from "react-apexcharts";
import type { ApexOptions } from "apexcharts";

import dynamic from "next/dynamic";
import { useState } from "react";
import { gmColor } from "@/lib/gm-color";

// Dynamically import the ReactApexChart component
const _ReactApexChart = dynamic(() => import("react-apexcharts"), {
  ssr: false,
});

export default function MonthlyTarget() {
  const _series = [75.55];
  const _options: ApexOptions = {
    colors: [gmColor("--gm-blue")],
    chart: {
      fontFamily: "Inter, sans-serif",
      type: "radialBar",
      height: 330,
      sparkline: {
        enabled: true,
      },
    },
    plotOptions: {
      radialBar: {
        startAngle: -85,
        endAngle: 85,
        hollow: {
          size: "80%",
        },
        track: {
          background: "#E4E7EC",
          strokeWidth: "100%",
          margin: 5, // margin is in pixels
        },
        dataLabels: {
          name: {
            show: false,
          },
          value: {
            fontSize: "36px",
            fontWeight: "600",
            offsetY: -40,
            color: gmColor("--gm-text-primary"),
            formatter(val) {
              return `${val}%`;
            },
          },
        },
      },
    },
    fill: {
      type: "solid",
      colors: [gmColor("--gm-blue")],
    },
    stroke: {
      lineCap: "round",
    },
    labels: ["Progress"],
  };

  const [isOpen, setIsOpen] = useState(false);

  function _toggleDropdown() {
    setIsOpen(!isOpen);
  }

  function _closeDropdown() {
    setIsOpen(false);
  }

  return (
    <div className="rounded-2xl border border-border bg-gray-100">
      <div className="rounded-2xl bg-background px-5 pt-5 pb-11 shadow-default sm:px-6 sm:pt-6">
        <p>PUBLIC FORECAST GOES HERE</p>
      </div>
    </div>
  );
}
