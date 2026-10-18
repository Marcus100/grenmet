import {
  formatDay,
  linePath,
  localMidnights,
  type Nullable,
  niceAxis,
  scaleLinear,
} from "@/lib/chart";

const WIDTH = 720;
const HEIGHT = 170;
const MARGIN = { top: 10, right: 12, bottom: 22, left: 44 };

export interface ChartSeries {
  kind: "line" | "bar";
  label: string;
  /** Tailwind stroke/fill class using semantic tokens only. */
  tone: "primary" | "muted" | "accent";
  values: readonly Nullable[];
}

interface MeteogramPanelProps {
  series: readonly ChartSeries[];
  /** Valid times as epoch milliseconds, aligned with every series. */
  times: readonly number[];
  title: string;
  unit: string;
}

const STROKE = {
  primary: "stroke-primary",
  muted: "stroke-muted-foreground",
  accent: "stroke-accent-foreground",
} as const;

const FILL = {
  primary: "fill-primary",
  muted: "fill-muted-foreground",
  accent: "fill-accent-foreground",
} as const;

/** One server-rendered SVG panel: lines and/or bars against Grenada local days. */
export function MeteogramPanel({
  series,
  times,
  title,
  unit,
}: MeteogramPanelProps) {
  const hasBars = series.some((s) => s.kind === "bar");
  const axis = niceAxis(
    series.flatMap((s) => s.values),
    { floorZero: hasBars, minSpan: hasBars ? 2 : 4 }
  );
  const first = times[0];
  const last = times.at(-1);

  if (!axis || first === undefined || last === undefined) {
    return (
      <figure className="space-y-1">
        <figcaption className="font-medium text-sm">{title}</figcaption>
        <p className="text-muted-foreground text-sm">
          This model has no values for this parameter.
        </p>
      </figure>
    );
  }

  const innerW = WIDTH - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const x = scaleLinear([first, last], [MARGIN.left, MARGIN.left + innerW]);
  const y = scaleLinear(
    [axis.min, axis.max],
    [MARGIN.top + innerH, MARGIN.top]
  );
  const barWidth = Math.max((innerW / Math.max(times.length - 1, 1)) * 0.7, 2);
  const days = localMidnights(first, last);

  return (
    <figure className="space-y-1">
      <figcaption className="flex flex-wrap items-baseline gap-x-3 font-medium text-sm">
        {title}
        <span className="font-normal text-muted-foreground text-xs">
          {unit}
          {series.length > 1
            ? ` | ${series.map((s) => s.label).join(", ")}`
            : ""}
        </span>
      </figcaption>
      <svg
        aria-label={`${title} (${unit}) over the forecast period`}
        className="w-full"
        role="img"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
      >
        {axis.ticks.map((tick) => (
          <g key={tick}>
            <line
              className="stroke-border"
              strokeWidth={1}
              x1={MARGIN.left}
              x2={WIDTH - MARGIN.right}
              y1={y(tick)}
              y2={y(tick)}
            />
            <text
              className="fill-muted-foreground"
              fontSize={10}
              textAnchor="end"
              x={MARGIN.left - 6}
              y={y(tick) + 3}
            >
              {tick}
            </text>
          </g>
        ))}
        {days.map((day) => (
          <g key={day}>
            <line
              className="stroke-border"
              strokeDasharray="2 3"
              strokeWidth={1}
              x1={x(day)}
              x2={x(day)}
              y1={MARGIN.top}
              y2={MARGIN.top + innerH}
            />
            <text
              className="fill-muted-foreground"
              fontSize={10}
              x={x(day) + 3}
              y={HEIGHT - 6}
            >
              {formatDay(day)}
            </text>
          </g>
        ))}
        {series.map((s) =>
          s.kind === "bar" ? (
            <g key={s.label}>
              {s.values.map((value, index) => {
                const time = times[index];
                if (value === null || time === undefined) return null;
                return (
                  <rect
                    className={FILL[s.tone]}
                    height={Math.max(y(0) - y(value), 0)}
                    key={time}
                    width={barWidth}
                    x={x(time) - barWidth / 2}
                    y={y(value)}
                  />
                );
              })}
            </g>
          ) : (
            <path
              className={STROKE[s.tone]}
              d={linePath(times, s.values, x, y)}
              fill="none"
              key={s.label}
              strokeLinejoin="round"
              strokeWidth={1.75}
            />
          )
        )}
      </svg>
    </figure>
  );
}
