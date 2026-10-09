import Link from "next/link";
import type { ForecastDay } from "@/lib/forecast-days";
import { cn } from "@/lib/utils";
import { type WeatherCondition, weatherIcon } from "@/lib/weather-icons";

export interface StripDay extends ForecastDay {
  href: string;
  /** Chance of rain, %; null when nothing is issued for the day. */
  rain: number | null;
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

const TAB =
  "flex h-full flex-col items-center gap-0.5 border-b-4 px-1 pt-2.5 pb-2 text-center outline-none hover:bg-gm-text-inverse/10 focus-visible:ring-2 focus-visible:ring-gm-lime focus-visible:ring-inset sm:gap-1 sm:pt-3 sm:pb-3";

function tabState(current: boolean) {
  return current
    ? "border-gm-lime bg-gm-text-inverse/20"
    : "border-transparent";
}

function SkyIcon({ sky, hidden }: { hidden?: boolean; sky: WeatherCondition }) {
  const Icon = weatherIcon(sky);
  return (
    <Icon
      aria-hidden="true"
      className={cn(
        "my-0.5 size-7 sm:size-9 lg:size-11",
        SKY_TINT[sky],
        hidden && "invisible"
      )}
      strokeWidth={1.7}
    />
  );
}

/**
 * The forecast days as the hero's tabs: day, date, sky, the maximum and
 * minimum, and the chance of rain. On phones a compact Now column leads the
 * strip (wider screens show the Now card beside it instead). Each tab links
 * to its route, which keeps the page and changes only the panel; the
 * selected tab gets a lime underline and `aria-current`.
 */
export function SkyDayStrip({
  days,
  now,
  selected,
}: {
  days: StripDay[];
  now: StripNow;
  /** `now`, or the `YYYY-MM-DD` of the day shown in the panel. */
  selected: string;
}) {
  const nowCurrent = selected === "now";
  return (
    <nav aria-label="Forecast days" className="h-full">
      <ul className="grid h-full grid-cols-6 overflow-hidden rounded-gm-card bg-gm-scrim sm:grid-cols-5">
        <li className="min-w-0 sm:hidden">
          <Link
            aria-current={nowCurrent ? "page" : undefined}
            className={cn(TAB, tabState(nowCurrent))}
            data-analytics-day="now"
            data-analytics-event="forecast_tab_selected"
            href={now.href}
            scroll={false}
          >
            <span className="font-bold text-body-base leading-body-base">
              Now
            </span>
            <span className="text-caption text-gm-text-inverse/85 tabular-nums leading-caption">
              {now.time ?? " "}
            </span>
            <SkyIcon sky={now.sky} />
            <span className="font-bold text-body-base tabular-nums leading-body-base">
              {now.temperature === null
                ? "—"
                : `${Math.round(now.temperature)}°`}
            </span>
          </Link>
        </li>
        {days.map((day) => {
          const current = day.slug === selected;
          const missing = day.high === null && day.low === null;
          return (
            <li
              className="min-w-0 border-gm-text-inverse/10 border-l sm:first:border-l-0"
              key={day.slug}
            >
              <Link
                aria-current={current ? "page" : undefined}
                className={cn(TAB, tabState(current))}
                data-analytics-day={day.isToday ? "today" : "next"}
                data-analytics-event="forecast_tab_selected"
                href={day.href}
                scroll={false}
              >
                <span className="font-bold text-body-base leading-body-base sm:text-heading-sm sm:leading-heading-sm">
                  {day.dayName}
                </span>
                <span className="text-caption text-gm-text-inverse/85 tabular-nums leading-caption sm:text-body-sm sm:leading-body-sm">
                  {day.date}
                  <span className="sr-only"> {day.month}</span>
                </span>
                <SkyIcon hidden={missing} sky={day.condition} />
                <span className="flex flex-col items-center tabular-nums sm:flex-row sm:items-baseline sm:gap-1">
                  <span className="font-bold text-body-base leading-body-base sm:text-heading-sm sm:leading-heading-sm">
                    {day.high === null ? "—" : `${day.high}°`}
                    <span className="sr-only"> maximum,</span>
                  </span>
                  <span className="text-caption text-gm-text-inverse/85 leading-caption sm:text-body-sm sm:leading-body-sm">
                    {day.low === null ? "—" : `${day.low}°`}
                    <span className="sr-only"> minimum</span>
                  </span>
                </span>
                <span className="hidden whitespace-nowrap font-semibold text-body-sm tabular-nums leading-body-sm sm:block">
                  {day.rain === null ? (
                    " "
                  ) : (
                    <>
                      {day.rain}%
                      <span className="sr-only"> chance of rain</span>
                    </>
                  )}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
