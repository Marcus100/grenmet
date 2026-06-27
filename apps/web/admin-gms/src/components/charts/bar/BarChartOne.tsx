"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

// Bar color references the GrenMet design token directly via `var(--gm-blue)`.
const data = [
  { month: "Jan", sales: 168 },
  { month: "Feb", sales: 385 },
  { month: "Mar", sales: 201 },
  { month: "Apr", sales: 298 },
  { month: "May", sales: 187 },
  { month: "Jun", sales: 195 },
  { month: "Jul", sales: 291 },
  { month: "Aug", sales: 110 },
  { month: "Sep", sales: 215 },
  { month: "Oct", sales: 390 },
  { month: "Nov", sales: 280 },
  { month: "Dec", sales: 112 },
];

export default function BarChartOne() {
  return (
    <div className="custom-scrollbar max-w-full overflow-x-auto">
      <div className="min-w-[1000px]" id="chartOne">
        <ResponsiveContainer height={180} width="100%">
          <BarChart
            barCategoryGap="35%"
            data={data}
            margin={{ top: 10, right: 10, bottom: 0, left: 0 }}
          >
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
            <Tooltip cursor={{ fill: "transparent" }} />
            <Bar dataKey="sales" fill="var(--gm-blue)" radius={[5, 5, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
