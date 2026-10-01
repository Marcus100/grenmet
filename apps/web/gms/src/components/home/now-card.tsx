import { ReadingRows } from "@/components/home/reading-rows";
import { isStale, localTime } from "@/lib/current-conditions";
import type { WeatherSnapshot } from "@/lib/forecast-data";
import { nowReadings } from "@/lib/hero-readings";
import { feelsLike } from "@/lib/hero-samples";

function Numeral({ value }: { value: number | null }) {
  return (
    <p className="font-gm-display font-semibold text-gm-numeral-hero tabular-nums">
      {value === null ? (
        <>
          —<span className="sr-only">No current temperature</span>
        </>
      ) : (
        <>
          {Math.round(value)}°<span className="sr-only">C</span>
        </>
      )}
    </p>
  );
}

/**
 * The latest MBIA register reading: temperature, what the sky is doing, then
 * the reading rows. Phones show the first four rows and fold the rest; the
 * midday product temperature stands in when there is no register reading.
 * A reading older than three hours says when it was taken.
 */
export function NowCard({
  now,
  weather,
}: {
  /** Clock for the stale-reading line; defaults to the render time. */
  now?: Date;
  weather: WeatherSnapshot;
}) {
  const current = weather.current;
  const temperature =
    current?.temperature ?? weather.observation?.temperature ?? null;
  const readings = current ? nowReadings(current) : null;

  let detail = "No current observation";
  if (current?.temperature != null) {
    detail = `Feels like ${Math.round(feelsLike(current.temperature, current.humidity))}°`;
  } else if (current) {
    detail = "";
  } else if (weather.observation) {
    detail = "Midday reading";
  }
  const stale =
    current && isStale(current.observedAt, now)
      ? `Last observed ${localTime(current.observedAt)}`
      : null;

  return (
    <section
      aria-label="Current conditions"
      className="grid min-w-0 content-start gap-2 rounded-gm-card bg-gm-scrim p-3 lg:gap-3 lg:p-4"
    >
      <div className="flex items-center gap-3">
        <Numeral value={temperature} />
        <div className="min-w-0">
          {current?.weather && (
            <p className="font-bold text-body-base leading-body-base">
              {current.weather}
            </p>
          )}
          {detail && (
            <p className="text-body-sm text-gm-text-inverse/85 leading-body-sm">
              {detail}
            </p>
          )}
          {stale && (
            <p className="text-body-sm text-gm-text-inverse/85 leading-body-sm">
              {stale}
            </p>
          )}
        </div>
      </div>
      {readings && (
        <>
          <ReadingRows
            hideFrom={readings.primary.length}
            readings={[...readings.primary, ...readings.extra]}
          />
          {readings.extra.length > 0 && (
            <details className="group lg:hidden">
              <summary className="flex min-h-11 cursor-pointer list-none items-center font-semibold text-body-sm leading-body-sm underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-gm-lime [&::-webkit-details-marker]:hidden">
                <span className="group-open:hidden">
                  More readings ({readings.extra.length})
                </span>
                <span className="hidden group-open:inline">Fewer readings</span>
              </summary>
              <ReadingRows className="border-t-0" readings={readings.extra} />
            </details>
          )}
        </>
      )}
    </section>
  );
}
