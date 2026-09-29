import { IssuedStamp } from "@/components/issued-stamp";
import { WeatherConditions } from "@/components/weather-conditions";
import type { ForecastDayData } from "@/lib/forecast-data";

/**
 * The selected day's issued forecast under the sky hero: title, the
 * forecaster's summary, the condition tiles and where the figures came from.
 */
export function DayDetails({
  day,
  label,
}: {
  day: ForecastDayData | undefined;
  /** Issue line for today; dated days carry their own `source`. */
  label?: string;
}) {
  return (
    <section
      aria-label="Forecast details"
      className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 lg:pt-8 xl:px-8"
    >
      <div className="overflow-hidden rounded-gm-card border border-gm-border bg-background">
        {day ? (
          <>
            <div className="border-gm-border border-b p-4 lg:p-5">
              <h2 className="font-bold text-gm-heading text-heading-sm leading-heading-sm">
                {day.title ?? "Forecast"}
              </h2>
              <p className="mt-1 max-w-prose text-body-base text-gm-text-secondary leading-body-base">
                {day.summary}
              </p>
            </div>
            {day.conditions.length > 0 && (
              <WeatherConditions conditions={day.conditions} />
            )}
            {(label ?? day.source) && (
              <div className="border-gm-border border-t bg-gm-surface px-4 py-3 lg:px-5">
                <IssuedStamp label={label ?? day.source} />
              </div>
            )}
          </>
        ) : (
          <p className="p-5 text-body-base leading-body-base">
            No issued forecast is available for this date. Choose a day in the
            forecast strip.
          </p>
        )}
      </div>
    </section>
  );
}
