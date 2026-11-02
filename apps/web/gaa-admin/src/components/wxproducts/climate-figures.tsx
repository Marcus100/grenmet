"use client";

import {
  eregisterPublicMonthSummary,
  type PublicMonthSummary,
} from "@barrelsgd/api-client";
import { useEffect, useState } from "react";

const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/u;

/** One figure line: the register's value, or "Not reported" (never zero). */
export function climateFigureRows(summary: PublicMonthSummary) {
  const value = (n: number | null | undefined, unit: string) =>
    n === null || n === undefined ? "Not reported" : `${n}${unit}`;
  return [
    { label: "Rainfall", value: value(summary.rainfall_mm, " mm") },
    { label: "Rain days", value: value(summary.rain_days, "") },
    {
      label: "Heavy rain days (10 mm+)",
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

/**
 * Read-only figures for the bulletin month from the eRegister month summary.
 * The bulletin stores no figures: the public page reads the same summary.
 */
export function ClimateFigures({
  month,
  issuedAt = "",
}: {
  month: string;
  issuedAt?: string;
}) {
  const [state, setState] = useState<
    | { status: "loading" }
    | { status: "ready"; summary: PublicMonthSummary | null }
    | { status: "error" }
  >({ status: "loading" });
  useEffect(() => {
    if (!MONTH.test(month)) return;
    let active = true;
    setState({ status: "loading" });
    eregisterPublicMonthSummary({ query: { month }, throwOnError: false })
      .then((result) => {
        if (!active) return;
        if (result.data)
          setState({ status: "ready", summary: result.data.summary ?? null });
        else setState({ status: "error" });
      })
      .catch(() => {
        if (active) setState({ status: "error" });
      });
    return () => {
      active = false;
    };
  }, [month]);
  return (
    <section
      aria-labelledby="climate-figures"
      className="space-y-2 rounded-lg border p-4"
    >
      <h2 className="text-heading-sm font-semibold" id="climate-figures">
        Register figures for {MONTH.test(month) ? month : "the bulletin month"}
      </h2>
      {issuedAt && issuedAt.slice(8, 10) !== "15" ? (
        <p className="text-sm" role="note">
          Climate Bulletins are issued on the 15th. This issue date is not the
          15th; you can still publish it, but the public site will not promise a
          next issue date.
        </p>
      ) : null}
      <p className="text-muted-foreground text-sm">
        From the eRegister month summary for station 78958. They are not typed
        into the bulletin; the public page shows the same figures.
      </p>
      {MONTH.test(month) ? null : (
        <p className="text-sm">Enter the month reviewed as YYYY-MM.</p>
      )}
      {MONTH.test(month) && state.status === "loading" ? (
        <p className="text-sm">Loading register figures…</p>
      ) : null}
      {MONTH.test(month) && state.status === "error" ? (
        <p className="text-sm">The register is unavailable. Try again later.</p>
      ) : null}
      {MONTH.test(month) && state.status === "ready" && !state.summary ? (
        <p className="text-sm">No register readings for this month.</p>
      ) : null}
      {MONTH.test(month) && state.status === "ready" && state.summary ? (
        <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
          {climateFigureRows(state.summary).map((row) => (
            <div className="flex justify-between gap-4" key={row.label}>
              <dt className="text-muted-foreground">{row.label}</dt>
              <dd className="font-medium">{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </section>
  );
}
