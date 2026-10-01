import type { LucideIcon } from "lucide-react";
import { CloudRainIcon, CloudSunIcon, MoonIcon, SunIcon } from "lucide-react";
import { ReadingRows } from "@/components/home/reading-rows";
import type { ForecastDayData } from "@/lib/forecast-data";
import { dayPeriods, dayReadings, isIssued } from "@/lib/hero-readings";
import type { PeriodSky } from "@/lib/hero-samples";

const SKY: Record<PeriodSky, LucideIcon> = {
  fair: MoonIcon,
  "partly-cloudy": CloudSunIcon,
  showers: CloudRainIcon,
  sunny: SunIcon,
};

/**
 * The selected day under the day tabs: its periods with their skies, the
 * forecaster's words, then the reading rows. A day with nothing issued shows
 * only what the feed says about it.
 */
export function DayPanel({
  day,
  index,
  note,
}: {
  day: ForecastDayData;
  /** Day offset from today; picks the day's samples. */
  index: number;
  /** Extra context, e.g. the national forecast on a place page. */
  note?: string;
}) {
  if (!isIssued(day)) {
    return (
      <section
        aria-label="Forecast details"
        className="grid gap-1 rounded-gm-card bg-gm-scrim p-3 lg:p-4"
      >
        <p className="font-bold text-body-base leading-body-base">
          {day.title ?? day.summary}
        </p>
        {day.title && day.summary !== day.title && (
          <p className="text-body-sm text-gm-text-inverse/85 leading-body-sm">
            {day.summary}
          </p>
        )}
      </section>
    );
  }
  const periods = dayPeriods(day, index);
  return (
    <section
      aria-label="Forecast details"
      className="grid gap-3 rounded-gm-card bg-gm-scrim p-3 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)] lg:gap-x-6 lg:p-4"
    >
      <div className="grid content-start gap-3">
        {periods.length > 0 && (
          <ul className="grid grid-cols-3 gap-px overflow-hidden rounded-lg">
            {periods.map((period) => {
              const Icon = SKY[period.sky];
              return (
                <li
                  className="grid content-start justify-items-center gap-0.5 bg-gm-scrim px-1.5 py-2 text-center"
                  key={period.label}
                >
                  <Icon
                    aria-hidden="true"
                    className="size-7"
                    strokeWidth={1.6}
                  />
                  <span className="font-bold text-label uppercase leading-label tracking-wider">
                    {period.label}
                  </span>
                  <span className="font-semibold text-body-sm leading-body-sm">
                    {period.summary}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="max-w-prose text-body-base leading-body-base">
          {day.summary}
        </p>
        {note && note !== day.summary && (
          <p className="text-body-sm text-gm-text-inverse/85 leading-body-sm">
            {note}
          </p>
        )}
      </div>
      <ReadingRows
        className="content-start"
        readings={dayReadings(day, index)}
      />
    </section>
  );
}
