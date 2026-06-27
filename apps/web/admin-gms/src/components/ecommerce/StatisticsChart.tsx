"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import ChartTab from "../common/ChartTab";

// Chart colors reference GrenMet design tokens directly via `var(--gm-*)`;
// Recharts renders real SVG so no runtime color resolution is required.
const data = [
  { month: "Jan", sales: 180, revenue: 40 },
  { month: "Feb", sales: 190, revenue: 30 },
  { month: "Mar", sales: 170, revenue: 50 },
  { month: "Apr", sales: 160, revenue: 40 },
  { month: "May", sales: 175, revenue: 55 },
  { month: "Jun", sales: 165, revenue: 40 },
  { month: "Jul", sales: 170, revenue: 70 },
  { month: "Aug", sales: 205, revenue: 100 },
  { month: "Sep", sales: 230, revenue: 110 },
  { month: "Oct", sales: 210, revenue: 120 },
  { month: "Nov", sales: 240, revenue: 150 },
  { month: "Dec", sales: 235, revenue: 140 },
];

export default function StatisticsChart() {
  return (
    <div className="rounded-2xl border border-border bg-background px-5 pt-5 pb-5 sm:px-6 sm:pt-6">
      <div className="mb-6 flex flex-col gap-5 sm:flex-row sm:justify-between">
        <div className="w-full">
          <h3 className="font-semibold text-foreground text-lg">Statistics</h3>
          <p className="mt-1 text-muted-foreground text-theme-sm">
            Target you’ve set for each month
          </p>
        </div>
        <div className="flex w-full items-start gap-3 sm:justify-end">
          <ChartTab />
        </div>
      </div>

      <div className="custom-scrollbar max-w-full overflow-x-auto">
        <div className="min-w-[1000px] xl:min-w-full">
          <ResponsiveContainer height={310} width="100%">
            <AreaChart
              data={data}
              margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
            >
              <defs>
                <linearGradient id="statsAreaBlue" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--gm-blue)"
                    stopOpacity={0.55}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--gm-blue)"
                    stopOpacity={0}
                  />
                </linearGradient>
                <linearGradient id="statsAreaSky" x1="0" x2="0" y1="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor="var(--gm-sky)"
                    stopOpacity={0.55}
                  />
                  <stop
                    offset="100%"
                    stopColor="var(--gm-sky)"
                    stopOpacity={0}
                  />
                </linearGradient>
              </defs>
              <CartesianGrid
                stroke="var(--gm-gridline, #f1f5f9)"
                vertical={false}
              />
              <XAxis
                axisLine={false}
                dataKey="month"
                tick={{ fontSize: 12, fill: "var(--gm-text-muted)" }}
                tickLine={false}
              />
              <YAxis
                axisLine={false}
                tick={{ fontSize: 12, fill: "var(--gm-text-muted)" }}
                tickLine={false}
                width={40}
              />
              <Tooltip />
              <Area
                dataKey="sales"
                fill="url(#statsAreaBlue)"
                stroke="var(--gm-blue)"
                strokeWidth={2}
                type="linear"
              />
              <Area
                dataKey="revenue"
                fill="url(#statsAreaSky)"
                stroke="var(--gm-sky)"
                strokeWidth={2}
                type="linear"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
