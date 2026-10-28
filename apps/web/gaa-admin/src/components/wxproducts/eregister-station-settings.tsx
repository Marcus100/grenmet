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

// The four fixed amounts, in the order the pressures are worked out.
const FIELDS: { id: string; key: keyof StationSettings; label: string }[] = [
  {
    id: "station-total-correction",
    key: "totalCorrectionHpa",
    label: "Total barometer correction (hPa)",
  },
  { id: "station-qfe-offset", key: "qfeOffsetHpa", label: "QFE amount (hPa)" },
  {
    id: "station-sea-level-offset",
    key: "seaLevelOffsetHpa",
    label: "Sea level amount (hPa)",
  },
  { id: "station-qnh-offset", key: "qnhOffsetHpa", label: "QNH amount (hPa)" },
];

/** A blank box clears the amount; anything else must be a plain number. */
function parse(text: string): number | null | "invalid" {
  const value = text.trim();
  if (value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : "invalid";
}

function show(value: number | null | undefined): string {
  return value === null || value === undefined ? "" : value.toFixed(1);
}

/**
 * The station's fixed pressure amounts: station pressure = barometer as read +
 * total correction; QFE = station + QFE amount; mean sea level = station + sea
 * level amount; QNH = sea level + QNH amount.
 */
export function StationSettingsCard({ onSave, settings }: Props) {
  const [texts, setTexts] = useState<Record<string, string>>(() =>
    Object.fromEntries(FIELDS.map(({ key }) => [key, show(settings?.[key])]))
  );
  const [status, setStatus] = useState<
    SettingsSaveResult | "invalid" | "saving" | null
  >(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = FIELDS.map(({ key }) => [key, parse(texts[key] ?? "")]);
    if (parsed.some(([, value]) => value === "invalid")) {
      setStatus("invalid");
      return;
    }
    setStatus("saving");
    setStatus(
      await onSave(Object.fromEntries(parsed) as unknown as StationSettings)
    );
  }

  let message: string | null = null;
  if (status === "invalid") message = "Enter numbers only, or leave blank.";
  else if (status !== null && status !== "saving") message = MESSAGES[status];

  return (
    <SectionCard className="w-fit max-w-full" title="Station settings">
      <form className="flex flex-col gap-3 p-4 text-sm" onSubmit={submit}>
        <div className="flex flex-wrap items-end gap-4">
          {FIELDS.map(({ id, key, label }) => (
            <div className="flex flex-col gap-1 text-xs" key={key}>
              <label className="text-muted-foreground" htmlFor={id}>
                {label}
              </label>
              <Input
                className="h-9 w-32 font-mono"
                id={id}
                inputMode="decimal"
                onChange={(event) =>
                  setTexts((current) => ({
                    ...current,
                    [key]: event.target.value,
                  }))
                }
                value={texts[key] ?? ""}
              />
            </div>
          ))}
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
