"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { type FormEvent, useState } from "react";
import type { StationSettings } from "./eregister-derived";
import { PendingSettingsNote, SectionCard } from "./eregister-ui";

export type SettingsSaveResult = "saved" | "forbidden" | "error";

interface Props {
  onSave: (settings: StationSettings) => Promise<SettingsSaveResult>;
  settings: StationSettings | null;
}

const MESSAGES: Record<SettingsSaveResult, string> = {
  error: "The station settings could not be saved. Try again.",
  forbidden:
    "Only register quality control staff can change the station settings.",
  saved: "Station settings saved.",
};

/** A blank box clears the setting; anything else must be a plain number. */
function parse(text: string): number | null | "invalid" {
  const value = text.trim();
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : "invalid";
}

function show(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : String(value);
}

/**
 * The two facts QFE and QNH need and nobody has supplied yet: the station
 * elevation and the total barometer corrections. Both start empty; nothing is
 * assumed.
 */
export function StationSettingsCard({ onSave, settings }: Props) {
  const [elevation, setElevation] = useState(show(settings?.elevationM));
  const [correction, setCorrection] = useState(
    show(settings?.barometerCorrectionHpa)
  );
  const [status, setStatus] = useState<
    SettingsSaveResult | "invalid" | "saving" | null
  >(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextElevation = parse(elevation);
    const nextCorrection = parse(correction);
    if (nextElevation === "invalid" || nextCorrection === "invalid") {
      setStatus("invalid");
      return;
    }
    setStatus("saving");
    setStatus(
      await onSave({
        barometerCorrectionHpa: nextCorrection,
        elevationM: nextElevation,
      })
    );
  }

  let message: string | null = null;
  if (status === "invalid") message = "Enter numbers only, or leave blank.";
  else if (status !== null && status !== "saving") message = MESSAGES[status];

  return (
    <SectionCard className="w-fit max-w-full" title="Station settings">
      <form className="flex flex-col gap-3 p-4 text-sm" onSubmit={submit}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1 text-xs">
            <label
              className="text-muted-foreground"
              htmlFor="station-elevation"
            >
              Station elevation (metres)
            </label>
            <Input
              className="h-9 w-40 font-mono"
              id="station-elevation"
              inputMode="decimal"
              onChange={(event) => setElevation(event.target.value)}
              value={elevation}
            />
          </div>
          <div className="flex flex-col gap-1 text-xs">
            <label
              className="text-muted-foreground"
              htmlFor="station-corrections"
            >
              Total barometer corrections (hPa)
            </label>
            <Input
              className="h-9 w-40 font-mono"
              id="station-corrections"
              inputMode="decimal"
              onChange={(event) => setCorrection(event.target.value)}
              value={correction}
            />
          </div>
          <Button
            disabled={status === "saving"}
            type="submit"
            variant="outline"
          >
            {status === "saving" ? "Saving…" : "Save settings"}
          </Button>
        </div>
        {message && (
          <p
            className="text-muted-foreground text-xs"
            role={status === "saved" ? "status" : "alert"}
          >
            {message}
          </p>
        )}
        <PendingSettingsNote settings={settings} />
      </form>
    </SectionCard>
  );
}
