import { ReadingGrid } from "@/components/home/reading-grid";
import type { StripDay } from "@/components/home/sky-day-strip";
import { SkyScene } from "@/components/home/sky-scene";
import type { ForecastDayData } from "@/lib/forecast-data";
import { dayReadings, isIssued } from "@/lib/hero-readings";
import { WEATHER_CONDITION_LABEL } from "@/lib/weather-icons";

const degrees = (value: number | null) => (value === null ? "—" : `${value}°`);

/** "Sunday 11 October" for the panel's date line. */
function longDate(slug: string): string {
  return new Date(`${slug}T12:00:00Z`).toLocaleString("en-GB", {
    day: "numeric",
    month: "long",
    timeZone: "UTC",
    weekday: "long",
  });
}

/**
 * The selected day as a picture summary, for the card above the tabs on
 * phones: the date, the maximum, the sky in words, the minimum, beside a sky
 * scene. It matches the Now summary's shape so the card keeps its height.
 */
export function DaySummary({ day }: { day: StripDay }) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
      <div className="grid min-w-0 content-start gap-0.5">
        <span className="truncate text-body-sm text-gm-text-inverse/85 leading-body-sm">
          {day.dayName} {day.date} {day.month} · Forecast
        </span>
        <p className="mt-1 font-gm-display font-semibold text-gm-numeral-hero tabular-nums">
          {degrees(day.high)}
          <span className="sr-only"> maximum</span>
        </p>
        <span className="truncate font-bold text-body-base leading-body-base">
          {WEATHER_CONDITION_LABEL[day.condition]}
        </span>
        <span className="text-body-sm text-gm-text-inverse/85 leading-body-sm">
          Min {degrees(day.low)}
        </span>
      </div>
      <SkyScene className="w-28" sky={day.condition} />
    </div>
  );
}

/**
 * The selected forecast day under the tabs: its maximum and minimum (shown
 * in the card above the tabs on phones instead), the date and the
 * forecaster's words, then the reading grid. Forecasts carry only a maximum
 * and minimum temperature. A day with nothing issued shows only what the feed
 * says about it.
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
  const chip = (
    <p className="flex flex-wrap items-center gap-2 text-caption uppercase leading-caption tracking-wider">
      <span className="rounded-full border border-gm-lime px-2 font-bold text-gm-lime">
        Forecast
      </span>
      {longDate(day.date)}
    </p>
  );
  if (!isIssued(day)) {
    // Same heading as an issued day, but no figures: an unissued day never
    // gets sample values.
    return (
      <section
        aria-label="Forecast details"
        className="grid content-start gap-4 rounded-gm-card bg-gm-scrim p-4 lg:p-5"
      >
        <div className="grid min-w-0 gap-1.5">
          {chip}
          <p className="max-w-prose text-balance font-bold text-heading-sm leading-heading-sm lg:text-heading-md lg:leading-heading-md">
            {day.title ?? day.summary}
          </p>
          {day.title && day.summary !== day.title && (
            <p className="max-w-prose text-body-base text-gm-text-inverse/85 leading-body-base">
              {day.summary}
            </p>
          )}
        </div>
        <p className="border-gm-text-inverse/15 border-t pt-4 text-body-sm text-gm-text-inverse/85 leading-body-sm">
          Wind, rain, seas, tides and sun times appear here once this day's
          forecast is issued.
        </p>
      </section>
    );
  }
  return (
    <section
      aria-label="Forecast details"
      className="grid content-start gap-4 rounded-gm-card bg-gm-scrim p-4 lg:p-5"
    >
      <div className="grid items-end gap-x-6 gap-y-2 sm:grid-cols-[auto_minmax(0,1fr)]">
        <div className="hidden sm:block">
          <p className="flex items-baseline gap-3 font-gm-display font-semibold tabular-nums">
            <span className="text-gm-numeral-hero">
              {degrees(day.high)}
              <span className="sr-only"> maximum,</span>
            </span>
            <span className="text-gm-numeral text-gm-text-inverse/85">
              {degrees(day.low)}
              <span className="sr-only"> minimum</span>
            </span>
          </p>
          <p
            aria-hidden="true"
            className="text-body-sm text-gm-text-inverse/85 leading-body-sm"
          >
            Max · Min
          </p>
        </div>
        <div className="grid min-w-0 gap-1.5 sm:pb-6">
          {chip}
          <p className="max-w-prose text-balance font-bold text-heading-sm leading-heading-sm lg:text-heading-md lg:leading-heading-md">
            {day.summary}
          </p>
          {note && note !== day.summary && (
            <p className="text-body-sm text-gm-text-inverse/85 leading-body-sm">
              {note}
            </p>
          )}
        </div>
      </div>
      <ReadingGrid readings={dayReadings(day, index)} />
    </section>
  );
}
