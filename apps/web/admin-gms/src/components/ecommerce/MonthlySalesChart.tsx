"use client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@grenmet/ui/components/ui/dropdown-menu";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { MoreDotIcon } from "@/icons";

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

export default function MonthlySalesChart() {
  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-background px-5 pt-5 sm:px-6 sm:pt-6">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-foreground text-lg">
          Monthly Rainfall
        </h3>

        <DropdownMenu>
          <DropdownMenuTrigger type="button">
            <MoreDotIcon className="text-gray-400 hover:text-gray-700" />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-40">
            <DropdownMenuItem>View More</DropdownMenuItem>
            <DropdownMenuItem>Delete</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="custom-scrollbar max-w-full overflow-x-auto">
        <div className="-ml-5 min-w-[650px] pl-2 xl:min-w-full">
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
              <Bar
                dataKey="sales"
                fill="var(--gm-blue)"
                radius={[5, 5, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
