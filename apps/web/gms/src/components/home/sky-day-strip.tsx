import { TabLink } from "@/components/home/hero-selection";
import { Temperature } from "@/components/measure";
import type { ForecastDay } from "@/lib/forecast-days";
import { cn } from "@/lib/utils";
import { type WeatherCondition, weatherIcon } from "@/lib/weather-icons";

export interface StripDay extends ForecastDay {
  href: string;
}

/** The compact Now column, shown in the strip on phones only. */
export interface StripNow {
  href: string;
  sky: WeatherCondition;
  temperature: number | null;
  time: string | null;
}

/** Rain skies take sky blue, sunny ones lime; cloud stays white. */
const SKY_TINT: Record<WeatherCondition, string> = {
  cloudy: "text-gm-text-inverse",
  "partly-cloudy": "text-gm-lime",
  showers: "text-gm-sky",
  sunny: "text-gm-lime",
};

/** Height of the icon row, the same in every column so the line can join them. */
const ICON_ROW = 64;
/** The icon row is shorter on phones; positions are in ICON_ROW units and scale with it. */
const ICON_ROW_CLASS = "h-10 sm:h-16";
/** How far an icon rises or sinks, in px, between the coolest and warmest tab. */
const LIFT = 9;

const TAB =
  "flex h-full flex-col items-center px-1 pt-2 pb-2 text-center sm:pt-3 sm:pb-3 outline-none hover:bg-gm-text-inverse/10 focus-visible:ring-2 focus-visible:ring-gm-lime focus-visible:ring-inset";

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

function SkyIcon({ sky, hidden }: { hidden?: boolean; sky: WeatherCondition }) {
  const Icon = weatherIcon(sky);
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "size-7 sm:size-9 lg:size-11",
        SKY_TINT[sky],
        hidden && "invisible"
      )}
      strokeWidth={1.7}
    />
  );
}

/** The icon, sitting on the line that joins it to its neighbours. */
function IconRow({
  after,
  before,
  hidden,
  hideLeft,
  sky,
  y,
}: {
  after: number | null;
  before: number | null;
  hidden?: boolean;
  /** Wide screens drop the Now column, so the first day has nothing to its left. */
  hideLeft?: boolean;
  sky: WeatherCondition;
  y: number | null;
}) {
  const { left, right } = lineSegments(y, before, after);
  return (
    <span
      aria-hidden="true"
      className={cn("relative my-0.5 block w-full sm:my-1", ICON_ROW_CLASS)}
    >
      <svg
        className="absolute inset-0 size-full overflow-visible"
        preserveAspectRatio="none"
        viewBox={`0 0 100 ${ICON_ROW}`}
      >
        {left && (
          <path
            {...LINE}
            className={cn(LINE.className, hideLeft && "sm:hidden")}
            d={left}
          />
        )}
        {right && <path {...LINE} d={right} />}
      </svg>
      <span
        className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{ top: `${((y ?? ICON_ROW / 2) / ICON_ROW) * 100}%` }}
      >
        <SkyIcon hidden={hidden} sky={sky} />
      </span>
    </span>
  );
}

/**
 * The forecast days as the hero's tabs, in the same shape as the Now column:
 * the day and date, the maximum in large type, the sky on a soft line that
 * rises and falls with the temperature, then the minimum. Rain chance is not
 * shown here. On phones a compact Now column leads the strip (wider screens
 * show the Now card beside it instead). Each tab is a real link to its route,
 * and a plain click switches the panel instantly on the client; the selected
 * tab is a lighter column and carries `aria-current`.
 */
export function SkyDayStrip({
  days,
  now,
}: {
  days: StripDay[];
  now: StripNow;
}) {
  // Columns left to right as phones show them: Now, then every day.
  const temperatures = [now.temperature, ...days.map((day) => day.high)];
  const known = temperatures.filter((value): value is number => value !== null);
  const coolest = known.length ? Math.min(...known) : 0;
  const warmest = known.length ? Math.max(...known) : 0;
  const ys = temperatures.map((value) => iconY(value, coolest, warmest));

  return (
    <nav aria-label="Forecast days" className="h-full">
      <ul className="grid h-full grid-cols-6 overflow-hidden rounded-gm-card bg-gm-scrim sm:grid-cols-5">
        <li className="min-w-0 sm:hidden">
          <TabLink
            className={TAB}
            currentClassName={CURRENT}
            data-analytics-day="now"
            data-analytics-event="forecast_tab_selected"
            href={now.href}
            idleClassName={IDLE}
            slug="now"
          >
            <span className="font-bold text-body-base leading-body-base">
              Now
            </span>
            <span className="text-caption text-gm-text-inverse/85 tabular-nums leading-caption">
              {now.time ?? " "}
            </span>
            <span className="mt-1 font-bold text-body-base tabular-nums leading-body-base sm:mt-2">
              <Temperature value={now.temperature} />
            </span>
            <IconRow
              after={ys[1] ?? null}
              before={null}
              sky={now.sky}
              y={ys[0] ?? null}
            />
            {/* No minimum for a reading: keep the row so every tab lines up. */}
            <span aria-hidden="true" className="text-caption leading-caption">
              {" "}
            </span>
          </TabLink>
        </li>
        {days.map((day, index) => {
          const missing = day.high === null && day.low === null;
          const column = index + 1;
          return (
            <li
              className="min-w-0 border-gm-text-inverse/10 border-l sm:first:border-l-0"
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
                <span className="font-bold text-body-base leading-body-base sm:text-heading-sm sm:leading-heading-sm">
                  {day.dayName}
                </span>
                <span className="text-caption text-gm-text-inverse/85 tabular-nums leading-caption sm:text-body-sm sm:leading-body-sm">
                  {day.date}
                  <span className="sr-only"> {day.month}</span>
                </span>
                <span className="mt-1 font-bold text-body-base tabular-nums leading-body-base sm:mt-2 sm:text-heading-sm sm:leading-heading-sm">
                  <Temperature value={day.high} />
                  {day.high !== null && (
                    <span className="sr-only"> maximum</span>
                  )}
                </span>
                <IconRow
                  after={ys[column + 1] ?? null}
                  before={ys[column - 1] ?? null}
                  hidden={missing}
                  hideLeft={index === 0}
                  sky={day.condition}
                  y={ys[column] ?? null}
                />
                {missing ? (
                  // Nothing is shown for a missing forecast, but the row keeps its
                  // height so every tab lines up; screen readers still hear why.
                  <span className="text-caption leading-caption sm:text-body-sm sm:leading-body-sm">
                    <span aria-hidden="true"> </span>
                    <span className="sr-only">No forecast yet</span>
                  </span>
                ) : (
                  <span className="text-caption text-gm-text-inverse/85 tabular-nums leading-caption sm:text-body-sm sm:leading-body-sm">
                    <Temperature value={day.low} />
                    {day.low !== null && (
                      <span className="sr-only"> minimum</span>
                    )}
                  </span>
                )}
              </TabLink>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
