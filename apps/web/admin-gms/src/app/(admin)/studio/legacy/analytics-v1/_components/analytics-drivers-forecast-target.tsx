"use client";

import {
  Card,
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
  Bar,
  CartesianGrid,
  ComposedChart,
  Dot,
  LabelList,
  Line,
  ReferenceLine,
  XAxis,
  YAxis,
} from "recharts";

const forecastChartConfig = {
  closedWon: {
    label: "Closed Won",
    color: "var(--chart-1)",
  },
  weightedPipeline: {
    label: "Weighted Pipeline",
    color: "var(--chart-2)",
  },
  target: {
    label: "Target",
    color: "var(--muted-foreground)",
  },
} satisfies ChartConfig;

type TrendPoint = {
  period: string;
  closedWon: number;
  weightedPipeline: number;
  target: number;
  deltaLabel?: string;
};

const CHART_DATA: TrendPoint[] = [
  { period: "W1", closedWon: 68.6, weightedPipeline: 152.4, target: 100 },
  { period: "W2", closedWon: 87.1, weightedPipeline: 158.1, target: 100 },
  { period: "W3", closedWon: 77.1, weightedPipeline: 154.8, target: 100 },
  { period: "W4", closedWon: 94.3, weightedPipeline: 162.2, target: 100 },
  { period: "W5", closedWon: 80.6, weightedPipeline: 160.4, target: 100 },
  { period: "W6", closedWon: 100, weightedPipeline: 168.5, target: 100 },
  { period: "W7", closedWon: 87.5, weightedPipeline: 172.1, target: 100 },
  { period: "W8", closedWon: 95.8, weightedPipeline: 178.3, target: 100 },
  { period: "W9", closedWon: 100, weightedPipeline: 181.0, target: 100 },
  { period: "W10", closedWon: 95.9, weightedPipeline: 185.4, target: 100 },
  { period: "W11", closedWon: 104.1, weightedPipeline: 188.7, target: 100 },
  {
    period: "W12",
    closedWon: 109.5,
    weightedPipeline: 192.1,
    target: 100,
    deltaLabel: "+9.5pp",
  },
];

export function DriversForecastTarget() {
  const chartData = CHART_DATA;
  const pipelineMin = Math.min(
    ...CHART_DATA.map((point) => point.weightedPipeline)
  );
  const pipelineMax = Math.max(
    ...CHART_DATA.map((point) => point.weightedPipeline)
  );

  return (
    <Card className="shadow-xs">
      <CardHeader>
        <CardTitle>Forecast vs Target</CardTitle>
        <CardDescription>12-week trend with attainment context</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <MetricChip
            label="Attainment"
            note="closed won / monthly target"
            value="72.4%"
          />
          <MetricChip
            label="Weighted Pipeline"
            note="vs $668,000 remaining"
            value="$1,284,000"
          />
          <MetricChip
            label="Forecast Confidence"
            note="volatility-adjusted confidence"
            value="81.0%"
          />
        </div>
        <ChartContainer className="h-68 w-full" config={forecastChartConfig}>
          <ComposedChart
            data={chartData}
            margin={{ left: 4, right: 8, top: 8, bottom: 0 }}
          >
            <CartesianGrid
              stroke="var(--border)"
              strokeOpacity={0.25}
              vertical={false}
            />
            <XAxis
              axisLine={false}
              dataKey="period"
              tickLine={false}
              tickMargin={10}
            />
            <YAxis
              axisLine={false}
              domain={[0, "auto"]}
              tickFormatter={(value) => `${Math.round(value)}%`}
              tickLine={false}
              tickMargin={8}
              ticks={[0, 50, 100, 150, 200]}
              width={44}
            />
            <YAxis
              domain={[pipelineMin, pipelineMax]}
              hide
              yAxisId="pipeline"
            />
            <ChartTooltip
              content={(props) => (
                <ChartTooltipContent
                  active={props.active}
                  className="w-48"
                  label={props.label}
                  payload={(props.payload ?? []).map((item) => ({
                    ...item,
                    value:
                      typeof item.value === "number"
                        ? `${item.value.toFixed(1)}%`
                        : item.value,
                  }))}
                />
              )}
              cursor={false}
            />
            <ReferenceLine
              stroke="var(--color-target)"
              strokeDasharray="6 5"
              strokeWidth={2}
              y={100}
            />
            <Bar
              barSize={14}
              dataKey="closedWon"
              fill="var(--color-closedWon)"
              fillOpacity={0.22}
              name="Closed won"
              radius={[5, 5, 0, 0]}
              stroke="var(--color-closedWon)"
              strokeOpacity={0.35}
            >
              <LabelList
                dataKey="deltaLabel"
                fill="var(--color-closedWon)"
                offset={8}
                position="top"
              />
            </Bar>
            <Line
              activeDot={false}
              dataKey="weightedPipeline"
              dot={({ payload, ...props }) => (
                <Dot
                  cx={props.cx}
                  cy={props.cy}
                  fill="var(--color-weightedPipeline)"
                  key={`${payload.period}-weighted-pipeline`}
                  r={3.5}
                  stroke="var(--color-weightedPipeline)"
                  strokeOpacity={0.08}
                  strokeWidth={7}
                />
              )}
              isAnimationActive={false}
              name="Pipeline vs target"
              stroke="var(--color-weightedPipeline)"
              strokeOpacity={0}
              strokeWidth={0}
              type="monotone"
              yAxisId="pipeline"
            />
          </ComposedChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}

function MetricChip({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) {
  return (
    <div className="rounded-md border bg-muted/35 px-3 py-2.5">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="font-semibold text-lg tabular-nums">{value}</p>
      <p className="text-muted-foreground text-xs">{note}</p>
    </div>
  );
}
