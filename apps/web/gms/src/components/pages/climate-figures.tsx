import type { PublicMonthSummary } from "@barrelsgd/api-client";
import { fetchMonthSummary } from "@/lib/products";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;

/** Register figures as label/value rows; an unreported figure is never shown as zero. */
export function climateFigureRows(summary: PublicMonthSummary) {
  const value = (n: number | null | undefined, unit: string) =>
    n === null || n === undefined ? "Not reported" : `${n}${unit}`;
  return [
    { label: "Rainfall", value: value(summary.rainfall_mm, " mm") },
    { label: "Rain days", value: value(summary.rain_days, "") },
    {
      label: "Heavy rain days (10 mm or more)",
      value: value(summary.heavy_rain_days, ""),
    },
    {
      label: "Longest dry spell",
      value: value(summary.longest_dry_spell_days, " days"),
    },
    {
      label: "Highest temperature",
      value: value(summary.max_temperature_c, " °C"),
    },
    {
      label: "Lowest temperature",
      value: value(summary.min_temperature_c, " °C"),
    },
  ];
}

/** Figures for a Climate Bulletin month, read live from the eRegister month summary (MBIA, 78958). */
export async function ClimateFigures({ month }: { month: string }) {
  const summary = MONTH.test(month) ? await fetchMonthSummary(month) : null;
  return (
    <section
      aria-labelledby="climate-figures"
      className="space-y-3 rounded-gm-card border border-gm-border p-4"
    >
      <h2
        className="font-bold font-gm-display text-gm-heading text-heading-sm leading-heading-sm"
        id="climate-figures"
      >
        The month in figures
      </h2>
      {summary ? (
        <>
          <dl className="grid gap-x-6 gap-y-2 text-body leading-body sm:grid-cols-2">
            {climateFigureRows(summary).map((row) => (
              <div className="flex justify-between gap-4" key={row.label}>
                <dt className="text-gm-text-secondary">{row.label}</dt>
                <dd className="font-semibold">{row.value}</dd>
              </div>
            ))}
          </dl>
          <p className="text-body-sm text-gm-text-secondary leading-body-sm">
            Maurice Bishop International Airport (station 78958), from the
            observation register. Figures are provisional until every reading is
            accepted.
          </p>
        </>
      ) : (
        <p className="text-body text-gm-text-secondary leading-body">
          Register figures for this month are not available right now.
        </p>
      )}
    </section>
  );
}
