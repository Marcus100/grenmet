import { TabLink } from "@/components/home/hero-selection";
import type { ForecastDay } from "@/lib/forecast-days";
import { cn } from "@/lib/utils";
import { type WeatherCondition, weatherIcon } from "@/lib/weather-icons";

export interface StripDay extends ForecastDay {
  href: string;
  /** Chance of rain as shown ("Low" … "High", or an older "40%"); null when nothing is issued. */
  rain: string | null;
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

const CURRENT = "border-gm-lime bg-gm-text-inverse/20";
const IDLE = "border-transparent";

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
 * strip (wider screens show the Now card beside it instead). Each tab is a
 * real link to its route, and a plain click switches the panel instantly on the
 * client; the selected tab gets a lime underline and `aria-current`.
 */
export function SkyDayStrip({
  days,
  now,
}: {
  days: StripDay[];
  now: StripNow;
}) {
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
            <SkyIcon sky={now.sky} />
            <span className="font-bold text-body-base tabular-nums leading-body-base">
              {now.temperature === null
                ? "—"
                : `${Math.round(now.temperature)}°`}
            </span>
          </TabLink>
        </li>
        {days.map((day) => {
          const missing = day.high === null && day.low === null;
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
                      {day.rain}
                      <span className="sr-only"> chance of rain</span>
                    </>
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
