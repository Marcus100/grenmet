"use client";

import {
  Card,
  CardAction,
  CardContent,
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
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@grenmet/ui/components/ui/select";
import { Separator } from "@grenmet/ui/components/ui/separator";
import { formatCurrency } from "@grenmet/ui/lib/utils";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

const chartData = [
  { month: "Jan", income: 5900, expenses: -4200 },
  { month: "Feb", income: 3800, expenses: -6100 },
  { month: "Mar", income: 5200, expenses: -5600 },
  { month: "Apr", income: 7100, expenses: -3200 },
  { month: "May", income: 4500, expenses: -4400 },
  { month: "Jun", income: 6100, expenses: -3600 },
  { month: "Jul", income: 3300, expenses: -5200 },
  { month: "Aug", income: 4300, expenses: -4000 },
  { month: "Sep", income: 7200, expenses: -5800 },
  { month: "Oct", income: 5600, expenses: -4600 },
  { month: "Nov", income: 3600, expenses: -6400 },
  { month: "Dec", income: 4700, expenses: -3400 },
];

const chartConfig = {
  income: {
    label: "Income",
    color: "var(--chart-1)",
  },
  expenses: {
    label: "Expenses",
    color: "var(--chart-2)",
  },
} as ChartConfig;

export function CashFlowOverview() {
  const totalIncome = chartData.reduce((acc, item) => acc + item.income, 0);
  const totalExpenses = chartData.reduce(
    (acc, item) => acc + Math.abs(item.expenses),
    0
  );
  return (
    <Card>
      <CardHeader>
        <CardTitle>Cash Flow Overview</CardTitle>
        <CardDescription>
          Monthly income and expenses with net cash impact.
        </CardDescription>
        <CardAction>
          <Select defaultValue="this-year">
            <SelectTrigger className="w-37" size="sm">
              <SelectValue placeholder="Select period" />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="this-month">This Month</SelectItem>
                <SelectItem value="last-6-months">Last 6 Months</SelectItem>
                <SelectItem value="ytd">Year to Date</SelectItem>
                <SelectItem value="this-year">This Year</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </CardAction>
      </CardHeader>
      <CardContent>
        <Separator />
        <div className="flex items-start justify-between gap-2 py-5 md:items-stretch md:gap-0">
          <div className="flex flex-1 items-center justify-center gap-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chart-1">
              <ArrowDownLeft className="size-6 stroke-background" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase">Income</p>
              <p className="font-medium tabular-nums">
                {formatCurrency(totalIncome, { noDecimals: true })}
              </p>
            </div>
          </div>
          <Separator className="h-auto! self-stretch" orientation="vertical" />
          <div className="flex flex-1 items-center justify-center gap-2">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-chart-2">
              <ArrowUpRight className="size-6 stroke-background" />
            </div>
            <div>
              <p className="text-muted-foreground text-xs uppercase">
                Expenses
              </p>
              <p className="font-medium tabular-nums">
                {formatCurrency(totalExpenses, { noDecimals: true })}
              </p>
            </div>
          </div>
        </div>
        <Separator />
        <ChartContainer className="max-h-72 w-full" config={chartConfig}>
          <BarChart
            accessibilityLayer
            data={chartData}
            margin={{ left: -25, right: 0, top: 25, bottom: 0 }}
            stackOffset="sign"
          >
            <CartesianGrid vertical={false} />
            <XAxis
              axisLine={false}
              dataKey="month"
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              axisLine={false}
              tickFormatter={(value) => {
                const abs = Math.abs(value);
                const formatted = abs >= 1000 ? `${abs / 1000}k` : `${abs}`;
                return value < 0 ? `-${formatted}` : formatted;
              }}
              tickLine={false}
              tickMargin={8}
              ticks={[-8000, -4000, 0, 4000, 8000]}
            />
            <ChartTooltip content={<ChartTooltipContent hideLabel />} />
            <ReferenceLine stroke="var(--border)" y={0} />
            <Bar
              dataKey="income"
              fill={chartConfig.income.color}
              radius={[4, 4, 0, 0]}
              stackId="a"
            />
            <Bar
              dataKey="expenses"
              fill={chartConfig.expenses.color}
              radius={[4, 4, 0, 0]}
              stackId="a"
            />
          </BarChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
