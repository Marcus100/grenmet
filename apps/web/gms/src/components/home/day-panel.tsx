import { ReadingGrid } from "@/components/home/reading-grid";
import type { ForecastDayData } from "@/lib/forecast-data";
import { dayReadings, isIssued } from "@/lib/hero-readings";

/**
 * The selected forecast day's details under the tabs: seas, swell, sun and
 * tides. Its temperatures, sky, rain chance, wind and the forecaster's words
 * are in the card above. A day with nothing issued says so and never gets
 * invented values.
 */
export function DayPanel({
  day,
  note,
}: {
  day: ForecastDayData;
  /** Extra context, e.g. the national forecast on a place page. */
  note?: string;
}) {
  return (
    <section
      aria-label="Forecast details"
      className="rounded-gm-card bg-gm-scrim grid h-full content-start gap-3 px-4 py-3 lg:px-5"
    >
      {isIssued(day) ? (
        <ReadingGrid className="border-t-0 pt-0" readings={dayReadings(day)} />
      ) : (
        <p className="text-body-sm text-gm-text-inverse/85 leading-body-sm">
          Seas, sun and tides appear here once this day's forecast is issued.
        </p>
      )}
      {note && note !== day.summary && (
        <p className="text-body-sm text-gm-text-inverse/85 leading-body-sm">
          {note}
        </p>
      )}
    </section>
  );
}
