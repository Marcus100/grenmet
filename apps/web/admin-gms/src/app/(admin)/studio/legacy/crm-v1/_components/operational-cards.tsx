"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@grenmet/ui/components/ui/card";
import { ChartContainer } from "@grenmet/ui/components/ui/chart";
import { Checkbox } from "@grenmet/ui/components/ui/checkbox";
import { Progress } from "@grenmet/ui/components/ui/progress";
import { cn, formatCurrency } from "@grenmet/ui/lib/utils";
import { Clock } from "lucide-react";
import { Funnel, FunnelChart, LabelList } from "recharts";

import {
  actionItems,
  regionSalesData,
  salesPipelineChartConfig,
  salesPipelineChartData,
} from "./crm.config";

export function OperationalCards() {
  const totalSales = regionSalesData.reduce(
    (sum, region) => sum + region.sales,
    0
  );
  return (
    <div className="grid grid-cols-1 gap-4 *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-3">
      <Card>
        <CardHeader>
          <CardTitle>Sales Pipeline</CardTitle>
        </CardHeader>
        <CardContent className="size-full">
          <ChartContainer
            className="size-full"
            config={salesPipelineChartConfig}
          >
            <FunnelChart margin={{ left: 0, right: 0, top: 0, bottom: 0 }}>
              <Funnel
                className="stroke-2 stroke-card"
                data={salesPipelineChartData}
                dataKey="value"
              >
                <LabelList
                  className="fill-foreground stroke-0"
                  dataKey="stage"
                  offset={10}
                  position="right"
                />
                <LabelList
                  className="fill-foreground stroke-0"
                  dataKey="value"
                  offset={10}
                  position="left"
                />
              </Funnel>
            </FunnelChart>
          </ChartContainer>
        </CardContent>
        <CardFooter>
          <p className="text-muted-foreground text-xs">
            Leads increased by 18.2% since last month.
          </p>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sales by Region</CardTitle>
          <CardDescription className="font-medium tabular-nums">
            {formatCurrency(totalSales, { noDecimals: true })}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2.5">
            {regionSalesData.map((region) => (
              <div className="space-y-0.5" key={region.region}>
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{region.region}</span>
                  <div className="flex items-baseline gap-1">
                    <span className="font-semibold text-sm tabular-nums">
                      {formatCurrency(region.sales, { noDecimals: true })}
                    </span>
                    <span
                      className={cn(
                        "font-medium text-xs tabular-nums",
                        region.isPositive
                          ? "text-green-500"
                          : "text-destructive"
                      )}
                    >
                      {region.growth}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Progress value={region.percentage} />
                  <span className="font-medium text-muted-foreground text-xs tabular-nums">
                    {region.percentage}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
        <CardFooter>
          <div className="flex justify-between gap-1 text-muted-foreground text-xs">
            <span>{regionSalesData.length} regions tracked</span>
            <span>•</span>
            <span>
              {regionSalesData.filter((r) => r.isPositive).length} regions
              growing
            </span>
          </div>
        </CardFooter>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Action Items</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2.5">
            {actionItems.map((item) => (
              <li
                className="space-y-2 rounded-md border px-3 py-2"
                key={item.id}
              >
                <div className="flex items-center gap-2">
                  <Checkbox defaultChecked={item.checked} />
                  <span className="font-medium text-sm">{item.title}</span>
                  <span
                    className={cn(
                      "w-fit rounded-md px-2 py-1 font-medium text-xs",
                      item.priority === "High" &&
                        "bg-destructive/20 text-destructive",
                      item.priority === "Medium" &&
                        "bg-yellow-500/20 text-yellow-500",
                      item.priority === "Low" &&
                        "bg-green-500/20 text-green-500"
                    )}
                  >
                    {item.priority}
                  </span>
                </div>
                <div className="font-medium text-muted-foreground text-xs">
                  {item.desc}
                </div>
                <div className="flex items-center gap-1">
                  <Clock className="size-3 text-muted-foreground" />
                  <span className="font-medium text-muted-foreground text-xs">
                    {item.due}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
