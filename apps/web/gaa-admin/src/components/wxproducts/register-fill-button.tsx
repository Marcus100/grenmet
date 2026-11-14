"use client";

import { eregisterPublicCurrentConditions } from "@barrelsgd/api-client";
import type { ProductField } from "@barrelsgd/gms/products";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useState } from "react";
import { reportError } from "@/lib/report-error";
import { REGISTER_HINT, registerFill } from "@/lib/wxproducts/register-fill";
import type { AlmanacFillApply } from "./almanac-fill-button";

/** What the forecaster reads after a fill: done, why not, or already typed. */
function fillLines(written: string[], notes: string[]): string[] {
  if (written.length > 0) return [REGISTER_HINT];
  if (notes.length > 0) return notes;
  return ["Nothing to fill: the midday temperature already has a value."];
}

interface Message {
  lines: string[];
  tone: "status" | "error";
}

/**
 * "Fill from register" for the midday forecast's observed temperature. Reads
 * the latest accepted MBIA observation through the public eRegister route
 * (forecasters need no register permission) and fills only empty fields, and
 * only from that day's 12:00 observation.
 */
export function RegisterFillButton({
  date,
  fields,
  onFill,
}: {
  /** The forecast's issue date, Grenada (YYYY-MM-DD); null when not set. */
  date: string | null;
  fields: readonly ProductField[];
  /** Writes the empty fields and returns the keys it wrote. */
  onFill: (apply: AlmanacFillApply) => string[];
}) {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);

  async function fill() {
    if (!date) return;
    setBusy(true);
    setMessage(null);
    try {
      const current = await eregisterPublicCurrentConditions().unwrap();
      const result = registerFill({
        date,
        fields,
        observation: current.observation,
      });
      const written = onFill({ patch: result.patch, prefix: "", rows: 0 });
      setMessage({ tone: "status", lines: fillLines(written, result.notes) });
    } catch (error) {
      reportError(error, "wxproducts");
      setMessage({
        tone: "error",
        lines: ["The register could not be read. Nothing was filled."],
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
          {busy ? "Reading the register…" : "Fill from register"}
        </Button>
        {date ? null : (
          <span className="text-muted-foreground text-xs">
            Set the issue date first.
          </span>
        )}
      </div>
      {/* Always mounted, so the first result is announced. */}
      <div
        aria-live="polite"
        className={
          message?.tone === "error"
            ? "text-destructive space-y-0.5 text-xs"
            : "text-muted-foreground space-y-0.5 text-xs"
        }
        role="status"
      >
        {message?.lines.map((line) => (
          // Each message line is a distinct sentence.
          <p key={line}>{line}</p>
        ))}
      </div>
    </div>
  );
}
