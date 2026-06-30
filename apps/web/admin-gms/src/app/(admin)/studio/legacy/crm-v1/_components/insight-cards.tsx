"use client";

import { Button } from "@grenmet/ui/components/ui/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@grenmet/ui/components/ui/card";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@grenmet/ui/components/ui/chart";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Label,
  LabelList,
  Pie,
  PieChart,
  XAxis,
  YAxis,
} from "recharts";

import {
  leadsBySourceChartConfig,
  leadsBySourceChartData,
  projectRevenueChartConfig,
  projectRevenueChartData,
} from "./crm.config";

export function InsightCards() {
  const totalLeads = leadsBySourceChartData.reduce(
    (acc, curr) => acc + curr.leads,
    0
  );

  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-5">
      <Card className="col-span-1 xl:col-span-2">
        <CardHeader>
          <CardTitle>Leads by Source</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center gap-6">
          <ChartContainer
            className="mx-auto aspect-square max-h-48 flex-1"
            config={leadsBySourceChartConfig}
          >
            <PieChart
              className="m-0"
              margin={{
                top: 0,
                right: 0,
                left: 0,
                bottom: 0,
              }}
            >
              <ChartTooltip
                content={<ChartTooltipContent hideLabel />}
                cursor={false}
              />
              <Pie
                cornerRadius={4}
                data={leadsBySourceChartData}
                dataKey="leads"
                innerRadius={65}
                nameKey="source"
                outerRadius={90}
                paddingAngle={2}
              >
                <Label
                  content={({ viewBox }) => {
                    if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                      return (
                        <text
                          dominantBaseline="middle"
                          textAnchor="middle"
                          x={viewBox.cx}
                          y={viewBox.cy}
                        >
                          <tspan
                            className="fill-foreground font-bold text-3xl tabular-nums"
                            x={viewBox.cx}
                            y={viewBox.cy}
                          >
                            {totalLeads.toLocaleString()}
                          </tspan>
                          <tspan
                            className="fill-muted-foreground"
                            x={viewBox.cx}
                            y={(viewBox.cy || 0) + 24}
                          >
                            Leads
                          </tspan>
                        </text>
                      );
                    }
                  }}
                />
              </Pie>
            </PieChart>
          </ChartContainer>

          <ul className="flex flex-col gap-3">
            {leadsBySourceChartData.map((item) => (
              <li
                className="flex w-36 items-center justify-between"
                key={item.source}
              >
                <span className="flex items-center gap-2 text-xs capitalize">
                  <span
                    className="size-2.5 rounded-full"
                    style={{
                      background:
                        "color" in leadsBySourceChartConfig[item.source]
                          ? leadsBySourceChartConfig[item.source].color
                          : undefined,
                    }}
                  />
                  {leadsBySourceChartConfig[item.source].label}
                </span>
                <span className="text-xs tabular-nums">{item.leads}</span>
              </li>
            ))}
          </ul>
        </CardContent>
        <CardFooter className="gap-2">
          <Button className="basis-1/2" size="sm" variant="outline">
            View Full Report
          </Button>
          <Button className="basis-1/2" size="sm" variant="outline">
            Download CSV
          </Button>
        </CardFooter>
      </Card>

      <Card className="col-span-1 xl:col-span-3">
        <CardHeader>
          <CardTitle>Project Revenue vs. Target</CardTitle>
        </CardHeader>
        <CardContent className="size-full max-h-52">
          <ChartContainer
            className="size-full"
            config={projectRevenueChartConfig}
          >
            <BarChart
              accessibilityLayer
              data={projectRevenueChartData}
              layout="vertical"
            >
              <CartesianGrid horizontal={false} />
              <YAxis
                axisLine={false}
                dataKey="name"
                hide
                tickFormatter={(value) => value.slice(0, 3)}
                tickLine={false}
                tickMargin={10}
                type="category"
              />
              <XAxis dataKey="actual" hide type="number" />
              <ChartTooltip
                content={<ChartTooltipContent indicator="line" />}
                cursor={false}
              />
              <Bar dataKey="actual" fill="var(--color-actual)" stackId="a">
                <LabelList
                  className="fill-primary-foreground text-xs"
                  dataKey="name"
                  offset={8}
                  position="insideLeft"
                />
                <LabelList
                  className="fill-primary-foreground text-xs tabular-nums"
                  dataKey="actual"
                  offset={8}
                  position="insideRight"
                />
              </Bar>
              <Bar
                dataKey="remaining"
                fill="var(--color-remaining)"
                radius={[0, 6, 6, 0]}
                stackId="a"
              >
                <LabelList
                  className="fill-primary-foreground text-xs tabular-nums"
                  dataKey="remaining"
                  offset={8}
                  position="insideRight"
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
        <CardFooter>
          <p className="text-muted-foreground text-xs">
            Average progress: 78% · 2 projects above target
          </p>
        </CardFooter>
      </Card>
    </div>
  );
}
