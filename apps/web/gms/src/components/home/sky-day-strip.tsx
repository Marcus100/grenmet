import { TabLink } from "@/components/home/hero-selection";
import { SkyGlyph } from "@/components/home/sky-glyph";
import { Temperature } from "@/components/measure";
import type { ForecastDay } from "@/lib/forecast-days";
import { cn } from "@/lib/utils";
import {
  WEATHER_CONDITION_LABEL,
  type WeatherCondition,
} from "@/lib/weather-icons";

export interface StripDay extends ForecastDay {
  href: string;
  /** Issued chance of rain in words ("Medium"); null when none. */
  rainWord: string | null;
}

/** The Now column, the first tab at every width. */
export interface StripNow {
  href: string;
  sky: WeatherCondition;
  temperature: number | null;
  time: string | null;
}

/** Height of the icon row, the same in every column so the line can join them. */
const ICON_ROW = 64;
/** The icon row is shorter on phones; positions are in ICON_ROW units and scale with it. */
const ICON_ROW_CLASS = "h-10";
/** How far an icon rises or sinks, in px, between the coolest and warmest tab. */
const LIFT = 7;

const TAB =
  "flex h-full flex-col items-center px-0 pt-2 pb-2 text-center outline-none hover:bg-gm-text-inverse/10 focus-visible:ring-2 focus-visible:ring-gm-lime focus-visible:ring-inset";

/** The selected tab is a lighter column; there is no other marker. */
const CURRENT = "bg-gm-text-inverse/20";
const IDLE = "";

const LINE = {
  className: "fill-none stroke-gm-text-inverse/25",
  strokeLinecap: "round",
  strokeLinejoin: "round",
  strokeWidth: 3,
  vectorEffect: "non-scaling-stroke",
} as const;

/** Where an icon sits in its row: warmer is higher. Null when there is no figure. */
export function iconY(
  temperature: number | null,
  coolest: number,
  warmest: number
): number | null {
  if (temperature === null) return null;
  const warmth =
    warmest === coolest ? 0.5 : (temperature - coolest) / (warmest - coolest);
  return ICON_ROW / 2 + (0.5 - warmth) * 2 * LIFT;
}

/**
 * One column's share of the line through the icons: from the middle of the
 * previous icon to this one (`left`), and from this one to the middle of the
 * next (`right`). A side is empty when the neighbour has no figure.
 */
export function lineSegments(
  y: number | null,
  before: number | null,
  after: number | null
): { left: string; right: string } {
  if (y === null) return { left: "", right: "" };
  return {
    left: before === null ? "" : `M 0 ${(before + y) / 2} L 50 ${y}`,
    right: after === null ? "" : `M 50 ${y} L 100 ${(y + after) / 2}`,
  };
}

/** The icon, sitting on the line that joins it to its neighbours. */
function IconRow({
  after,
  before,
  hidden,
  sky,
  y,
}: {
  after: number | null;
  before: number | null;
  hidden?: boolean;
  sky: WeatherCondition;
  y: number | null;
}) {
  const { left, right } = lineSegments(y, before, after);
  return (
    <span
      aria-hidden="true"
      className={cn("relative my-0.5 block w-full", ICON_ROW_CLASS)}
    >
      <svg
        className="absolute inset-0 size-full overflow-visible"
        preserveAspectRatio="none"
        viewBox={`0 0 100 ${ICON_ROW}`}
      >
        {left && <path {...LINE} d={left} />}
        {right && <path {...LINE} d={right} />}
      </svg>
      <span
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ top: `${((y ?? ICON_ROW / 2) / ICON_ROW) * 100}%` }}
      >
        <SkyGlyph className={cn("size-7", hidden && "invisible")} sky={sky} />
      </span>
    </span>
  );
}

/**
 * The hero's tabs: Now, then every forecast day. Each column reads top to
 * bottom: the high (the temperature for Now), a filled sky icon on a soft
 * line that rises and falls with the temperature, the chance of rain in
 * words, the low, then the day and date. Each tab is a real link to its
 * route, and a plain click switches the card and panel instantly; the
 * selected tab is a lighter column and carries `aria-current`.
 */
export function SkyDayStrip({
  days,
  now,
}: {
  days: StripDay[];
  now: StripNow;
}) {
  const temperatures = [now.temperature, ...days.map((day) => day.high)];
  const known = temperatures.filter((value): value is number => value !== null);
  const coolest = known.length ? Math.min(...known) : 0;
  const warmest = known.length ? Math.max(...known) : 0;
  const ys = temperatures.map((value) => iconY(value, coolest, warmest));
  const small = "text-caption tabular-nums leading-caption";
  // The rain row only shows when a forecast gives a chance of rain; an empty
  // row left a gap between the icons and the lows.
  const anyRain = days.some((day) => day.rainWord);

  return (
    <nav aria-label="Forecast days">
      <ul className="grid grid-cols-6 overflow-hidden rounded-gm-card bg-gm-scrim">
        <li className="min-w-0">
          <TabLink
            className={TAB}
            currentClassName={CURRENT}
            data-analytics-day="now"
            data-analytics-event="forecast_tab_selected"
            href={now.href}
            idleClassName={IDLE}
            slug="now"
          >
            <span className="font-bold text-body-base tabular-nums leading-body-base">
              <Temperature value={now.temperature} />
            </span>
            <IconRow
              after={ys[1] ?? null}
              before={null}
              sky={now.sky}
              y={ys[0] ?? null}
            />
            {/* No rain chance or low for a reading: keep the rows so tabs line up. */}
            {anyRain && (
              <span aria-hidden="true" className={small}>
                {"\u00a0"}
              </span>
            )}
            <span aria-hidden="true" className={small}>
              {"\u00a0"}
            </span>
            <span className="mt-1 font-bold text-body-base leading-body-base">
              Now
            </span>
            <span className={cn(small, "text-gm-text-inverse/85")}>
              {now.time ?? "\u00a0"}
            </span>
          </TabLink>
        </li>
        {days.map((day, index) => {
          const missing = day.high === null && day.low === null;
          const column = index + 1;
          return (
            <li
              className="min-w-0 border-gm-text-inverse/10 border-l"
              key={day.slug}
            >
              <TabLink
                className={TAB}
                currentClassName={CURRENT}
                data-analytics-day={day.isToday ? "today" : "next"}
                data-analytics-event="forecast_tab_selected"
                href={day.href}
                idleClassName={IDLE}
                slug={day.slug}
              >
                <span className="font-bold text-body-base tabular-nums leading-body-base">
                  <Temperature value={day.high} />
                  {day.high !== null && (
                    <span className="sr-only"> maximum</span>
                  )}
                </span>
                <IconRow
                  after={ys[column + 1] ?? null}
                  before={ys[column - 1] ?? null}
                  hidden={missing}
                  sky={day.condition}
                  y={ys[column] ?? null}
                />
                {anyRain && (
                  <span
                    className={cn(
                      small,
                      "max-w-full overflow-hidden text-clip whitespace-nowrap text-gm-sky tracking-tight"
                    )}
                  >
                    {day.rainWord ?? "\u00a0"}
                    {day.rainWord && (
                      <span className="sr-only"> chance of rain</span>
                    )}
                  </span>
                )}
                <span className={cn(small, "text-gm-text-inverse/85")}>
                  {missing ? (
                    <>
                      <span aria-hidden="true">{"\u00a0"}</span>
                      <span className="sr-only">No forecast yet</span>
                    </>
                  ) : (
                    <>
                      <Temperature value={day.low} />
                      {day.low !== null && (
                        <span className="sr-only"> minimum</span>
                      )}
                    </>
                  )}
                </span>
                <span className="mt-1 font-bold text-body-base leading-body-base">
                  {day.dayName}
                </span>
                <span className={cn(small, "text-gm-text-inverse/85")}>
                  {day.date}
                  <span className="sr-only"> {day.month}</span>
                  {!missing && (
                    <span className="sr-only">
                      , {WEATHER_CONDITION_LABEL[day.condition]}
                    </span>
                  )}
                </span>
              </TabLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
