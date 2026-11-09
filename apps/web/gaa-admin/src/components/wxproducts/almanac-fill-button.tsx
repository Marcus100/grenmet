"use client";

import { almanacGetAstronomy, almanacGetTides } from "@barrelsgd/api-client";
import type { ProductField, ProductValues } from "@barrelsgd/gms/products";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useState } from "react";
import { reportError } from "@/lib/report-error";
import {
  ALMANAC_HINT,
  ALMANAC_LOCATION,
  addDays,
  almanacFill,
  TIDE_HINT,
  TIDE_STANDING_NOTE,
  TIDE_STATION,
  tideFill,
} from "@/lib/wxproducts/almanac-fill";

/** What the desk writes after a fill: canonical values plus the tide rows to show. */
export interface AlmanacFillApply {
  patch: ProductValues;
  /** The tide prefix the rows belong to ("" or "day2"). */
  prefix: string;
  rows: number;
}

/**
 * Why a fill wrote nothing: the table had values but the fields were already
 * typed, or the table had nothing for the date (its notes say which).
 */
function emptyFillLine(patch: ProductValues, what: string): string {
  return Object.keys(patch).length > 0
    ? `Nothing to fill: ${what} already have values.`
    : "No value was available to fill.";
}

interface Message {
  lines: string[];
  tone: "status" | "error";
}

/**
 * "Fill from almanac" for a section's sun and moon fields, or "Fill from tide
 * table" for its tide fields. Fetches the public almanac through the generated
 * client (the gaa-admin API proxy), fills only empty fields and reports what it
 * could not fill. The form itself stays with the editor (`onFill`).
 */
export function AlmanacFillButton({
  source,
  date,
  fields,
  marine,
  prefix,
  values,
  onFill,
}: {
  source: "almanac" | "tides";
  /** The day the section is for; null when an evening day has no date yet. */
  date: string | null;
  /** This section's fields that carry the source. */
  fields: readonly ProductField[];
  marine: boolean;
  prefix: string;
  values: ProductValues;
  /** Writes the empty fields and returns the keys it wrote. */
  onFill: (apply: AlmanacFillApply) => string[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const label =
    source === "almanac" ? "Fill from almanac" : "Fill from tide table";

  async function fill() {
    if (!date) return;
    setBusy(true);
    setMessage(null);
    try {
      if (source === "almanac") {
        const astronomy = await almanacGetAstronomy({
          query: {
            location: ALMANAC_LOCATION,
            from: date,
            to: addDays(date, 1),
          },
        }).unwrap();
        const result = almanacFill({ date, fields, astronomy });
        const written = onFill({ patch: result.patch, prefix, rows: 0 });
        setMessage({
          tone: "status",
          lines: [
            written.length > 0
              ? ALMANAC_HINT
              : emptyFillLine(result.patch, "these fields"),
            ...result.notes,
          ],
        });
        return;
      }
      const tides = await almanacGetTides({
        query: { station: TIDE_STATION, from: date, to: date },
      }).unwrap();
      const result = tideFill({ date, fields, prefix, tides, marine, values });
      const written = onFill({
        patch: result.patch,
        prefix,
        rows: result.rows,
      });
      // A blocked fill (typed tide slots) or an empty table says only why.
      const lines =
        written.length > 0
          ? [TIDE_HINT, ...result.summary, ...result.notes]
          : [...result.notes];
      setMessage({ tone: "status", lines });
    } catch (error) {
      reportError(error, "wxproducts");
      setMessage({
        tone: "error",
        lines: [
          source === "almanac"
            ? "The almanac could not be read. Nothing was filled."
            : "The tide table could not be read. Nothing was filled.",
        ],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex basis-full flex-col gap-1">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          disabled={busy || !date}
          onClick={fill}
          size="sm"
          type="button"
          variant="outline"
        >
          {busy ? "Reading the almanac…" : label}
        </Button>
        {date ? null : (
          <span className="text-muted-foreground text-xs">
            Set the date for this day first.
          </span>
        )}
      </div>
      {source === "tides" ? (
        <p className="text-muted-foreground text-xs">{TIDE_STANDING_NOTE}</p>
      ) : null}
      {message ? (
        <div
          aria-live="polite"
          className={
            message.tone === "error"
              ? "text-destructive space-y-0.5 text-xs"
              : "text-muted-foreground space-y-0.5 text-xs"
          }
          role={message.tone === "error" ? "alert" : "status"}
        >
          {message.lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      ) : null}
    </div>
  );
}
