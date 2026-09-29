"use client";

import { useState } from "react";
import { HeroFacts, SourceChip } from "@/components/home/hero-facts";
import { localTime } from "@/lib/current-conditions";
import type { ForecastDayData, TodayIssue } from "@/lib/forecast-data";
import { forecastTiles } from "@/lib/today-tiles";
import { cn } from "@/lib/utils";

/**
 * Today's issued forecast. The newest issue is selected; earlier issues stay
 * one tap away so nothing issued today disappears.
 */
export function TodayPanel({
  fallback,
  issues,
  note,
}: {
  /** Shown when nothing is issued yet for today. */
  fallback: ForecastDayData;
  issues: TodayIssue[];
  /** Extra context, e.g. the national forecast on a place page. */
  note?: string;
}) {
  const [selected, setSelected] = useState(issues.length - 1);
  const issue = issues[selected];
  const day = issue?.day ?? fallback;

  return (
    <div className="grid min-w-0 content-start gap-3 rounded-gm-card bg-gm-scrim p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-bold text-gm-text-inverse/85 text-label uppercase leading-label tracking-wider">
          Today
        </h2>
        {issues.length > 1 && (
          <fieldset className="flex flex-wrap gap-1.5">
            <legend className="sr-only">Forecast issue</legend>
            {issues.map((item, index) => (
              <button
                aria-pressed={index === selected}
                className={cn(
                  "min-h-9 rounded-full border px-3 font-bold text-body-sm leading-body-sm outline-none focus-visible:ring-2 focus-visible:ring-gm-lime",
                  index === selected
                    ? "border-gm-lime bg-gm-lime text-gm-navy"
                    : "border-gm-text-inverse/60 text-gm-text-inverse"
                )}
                key={item.kind}
                onClick={() => setSelected(index)}
                type="button"
              >
                {item.label}
              </button>
            ))}
          </fieldset>
        )}
      </div>
      {!issue && (
        <p className="font-bold text-body-base leading-body-base">
          {day.title ?? "Today"}
        </p>
      )}
      {(issue || day.summary !== day.title) && (
        <p className="text-body-base leading-body-base">{day.summary}</p>
      )}
      <HeroFacts foldLabel="More forecast" tiles={forecastTiles(day)} />
      {issue && (
        <p className="justify-self-start">
          <SourceChip kind="forecast">
            Forecast · {issue.label} {localTime(issue.issuedAt)}
          </SourceChip>
        </p>
      )}
      {note && note !== day.summary && note !== day.title && (
        <p className="text-body-sm text-gm-text-inverse/85 leading-body-sm">
          {note}
        </p>
      )}
    </div>
  );
}
