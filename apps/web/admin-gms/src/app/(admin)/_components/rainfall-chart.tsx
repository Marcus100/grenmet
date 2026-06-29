"use client";

import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@grenmet/ui/components/ui/card";
import {
  type ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@grenmet/ui/components/ui/chart";
import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

const data = [
  { month: "Jan", rainfall: 160 },
  { month: "Feb", rainfall: 380 },
  { month: "Mar", rainfall: 200 },
  { month: "Apr", rainfall: 300 },
  { month: "May", rainfall: 180 },
  { month: "Jun", rainfall: 190 },
  { month: "Jul", rainfall: 285 },
  { month: "Aug", rainfall: 110 },
  { month: "Sep", rainfall: 210 },
  { month: "Oct", rainfall: 380 },
  { month: "Nov", rainfall: 280 },
  { month: "Dec", rainfall: 110 },
];

const chartConfig = {
  rainfall: { label: "Rainfall (mm)", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function RainfallChart() {
  return (
    <Card className="p-6">
      <CardHeader className="p-0">
        <CardTitle>Monthly Rainfall</CardTitle>
        <CardDescription>Total recorded rainfall by month (mm)</CardDescription>
      </CardHeader>
      <ChartContainer className="mt-4 h-[280px] w-full" config={chartConfig}>
        <BarChart accessibilityLayer data={data}>
          <CartesianGrid vertical={false} />
          <XAxis
            axisLine={false}
            dataKey="month"
            tickLine={false}
            tickMargin={8}
          />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Bar dataKey="rainfall" fill="var(--color-rainfall)" radius={4} />
        </BarChart>
      </ChartContainer>
    </Card>
  );
}
