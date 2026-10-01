import Link from "next/link";
import type { ForecastDay } from "@/lib/forecast-days";
import { cn } from "@/lib/utils";
import { weatherIcon } from "@/lib/weather-icons";

export interface StripDay extends ForecastDay {
  href: string;
  /** Chance of rain, %; null when nothing is issued for the day. */
  rain: number | null;
}

type Scale = (value: number) => number;

/** SVG y (0–100) for a temperature; 12 units of padding top and bottom. */
function scaleFor(days: StripDay[]): Scale | null {
  const values = days.flatMap((day) =>
    [day.high, day.low].filter((value): value is number => value !== null)
  );
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const span = Math.max(...values) - min || 1;
  return (value) => 12 + (1 - (value - min) / span) * 76;
}

/**
 * One tab's slice of the high/low line: from the midpoint with the previous
 * day, through this day's dot, to the midpoint with the next. Adjacent tabs
 * meet at their shared edge, so the slices read as one line across the strip.
 */
function Slice({
  className,
  next,
  prev,
  scale,
  value,
}: {
  className: string;
  next: number | null;
  prev: number | null;
  scale: Scale;
  value: number | null;
}) {
  if (value === null) return null;
  const y = scale(value);
  const points = [
    prev === null ? null : `0,${(scale(prev) + y) / 2}`,
    `50,${y}`,
    next === null ? null : `100,${(scale(next) + y) / 2}`,
  ].filter(Boolean);
  return (
    <g className={className}>
      <polyline
        fill="none"
        points={points.join(" ")}
        stroke="currentColor"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
      />
      <line
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth={8}
        vectorEffect="non-scaling-stroke"
        x1={50}
        x2={50}
        y1={y}
        y2={y}
      />
    </g>
  );
}

/**
 * The five forecast days as the hero's tabs: day, sky, the high and low drawn
 * as a line across the strip, and the chance of rain. Each tab links to its
 * dated route (today to the place's home), which keeps the page and changes
 * only the day panel. The selected day gets a lime underline and
 * `aria-current`.
 */
export function SkyDayStrip({
  days,
  selected,
}: {
  days: StripDay[];
  /** `YYYY-MM-DD` of the day shown in the panel. */
  selected: string;
}) {
  const scale = scaleFor(days);
  return (
    <nav aria-label="Forecast days">
      <ul className="grid grid-cols-5 overflow-hidden rounded-gm-card bg-gm-scrim">
        {days.map((day, index) => {
          const current = day.slug === selected;
          const Icon = weatherIcon(day.condition);
          const missing = day.high === null && day.low === null;
          const prev = days[index - 1];
          const next = days[index + 1];
          return (
            <li
              className="min-w-0 border-gm-text-inverse/10 border-l first:border-l-0"
              key={day.slug}
            >
              <Link
                aria-current={current ? "page" : undefined}
                className={cn(
                  "flex h-full flex-col items-center border-b-4 px-1 pt-2.5 pb-1.5 text-center outline-none hover:bg-gm-text-inverse/10 focus-visible:ring-2 focus-visible:ring-gm-lime focus-visible:ring-inset lg:pt-3",
                  current
                    ? "border-gm-lime bg-gm-text-inverse/20"
                    : "border-transparent"
                )}
                href={day.href}
                scroll={false}
              >
                <span className="font-bold text-body-base leading-body-base lg:text-heading-sm lg:leading-heading-sm">
                  {day.isToday ? "Today" : day.dayName}
                </span>
                <span className="text-caption text-gm-text-inverse/85 tabular-nums leading-caption">
                  {day.date}
                  <span className="sr-only"> {day.month}</span>
                </span>
                <Icon
                  aria-hidden="true"
                  className={cn(
                    "mt-1 size-8 lg:size-9",
                    missing && "invisible"
                  )}
                  strokeWidth={1.6}
                />
                <span className="mt-1 font-bold text-body-base tabular-nums leading-body-base">
                  {day.high === null ? "—" : `${day.high}°`}
                  <span className="sr-only"> high,</span>
                </span>
                {scale && (
                  <svg
                    aria-hidden="true"
                    className="h-10 w-full overflow-visible lg:h-12"
                    preserveAspectRatio="none"
                    viewBox="0 0 100 100"
                  >
                    <Slice
                      className="text-gm-text-inverse"
                      next={next?.high ?? null}
                      prev={prev?.high ?? null}
                      scale={scale}
                      value={day.high}
                    />
                    <Slice
                      className="text-gm-sky"
                      next={next?.low ?? null}
                      prev={prev?.low ?? null}
                      scale={scale}
                      value={day.low}
                    />
                  </svg>
                )}
                <span className="font-semibold text-body-sm text-gm-text-inverse/85 tabular-nums leading-body-sm">
                  {day.low === null ? "—" : `${day.low}°`}
                  <span className="sr-only"> low</span>
                </span>
                <span className="mt-1 whitespace-nowrap font-semibold text-caption tabular-nums leading-caption">
                  {day.rain === null ? " " : `${day.rain}% rain`}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
