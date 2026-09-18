"use client";

import {
  type CapAlertPublic,
  capAlertListPublicSchema,
} from "@barrelsgd/api-client";
import type { CapInsertTarget } from "@barrelsgd/gms/products";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useId, useState } from "react";

const PARTS = ["headline", "description", "instruction"] as const;
type Part = (typeof PARTS)[number];

async function loadAlerts() {
  const response = await fetch("/api/cap/latest-active", {
    cache: "no-store",
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok)
    throw new Error("CAP bulletins could not be loaded. Try again.");
  return capAlertListPublicSchema.parse(await response.json()).data;
}

export function CapForecastPicker({
  targets,
  onInsert,
}: {
  targets: CapInsertTarget[];
  onInsert: (target: string, text: string) => void;
}) {
  const id = useId();
  const [alerts, setAlerts] = useState<CapAlertPublic[]>([]);
  const [selection, setSelection] = useState("");
  const [parts, setParts] = useState<Part[]>([]);
  const [target, setTarget] = useState(targets[0]?.value ?? "");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const options = alerts.flatMap((alert) =>
    (alert.info ?? []).map((info) => ({
      alert,
      info,
      key: `${alert.id}/${info.id}`,
    }))
  );
  const chosen = options.find((option) => option.key === selection);
  async function refresh() {
    setBusy(true);
    setSelection("");
    setParts([]);
    try {
      const data = await loadAlerts();
      setAlerts(data);
      setMessage(
        data.length
          ? "Select a bulletin and the text to copy."
          : "No active CAP bulletins are available."
      );
    } catch {
      setAlerts([]);
      setMessage("CAP bulletins could not be loaded. Try again.");
    } finally {
      setBusy(false);
    }
  }
  async function insert() {
    if (!(chosen && parts.length)) return;
    setBusy(true);
    try {
      const latest = await loadAlerts();
      const alert = latest.find((item) => item.id === chosen.alert.id);
      const info = alert?.info?.find((item) => item.id === chosen.info.id);
      if (
        !(alert && info) ||
        JSON.stringify(info) !== JSON.stringify(chosen.info) ||
        alert.sent !== chosen.alert.sent
      ) {
        setSelection("");
        setParts([]);
        setAlerts(latest);
        setMessage(
          "This bulletin changed or is no longer active. Select a current bulletin."
        );
        return;
      }
      const text = PARTS.filter((part) => parts.includes(part))
        .map((part) => info[part])
        .filter(Boolean)
        .join("\n\n");
      onInsert(
        target,
        `${text}\n\n[CAP ${alert.identifier}; sender ${alert.sender}; issued ${alert.sent}]`
      );
      setMessage(
        "Selected text copied. Review its area and validity against the forecast before publishing. Copied text does not update automatically."
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Could not copy CAP text. Try again."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="space-y-3 rounded-xl border bg-card p-4">
      <h2 className="font-semibold">Warning text from CAP</h2>
      <p className="text-muted-foreground text-sm">
        Choose existing warning text to append to this forecast. Check that its
        area and validity fit.
      </p>
      <Button disabled={busy} onClick={refresh} type="button" variant="outline">
        Load active CAP bulletins
      </Button>
      {options.length ? (
        <>
          <label className="block text-sm" htmlFor={`${id}-bulletin`}>
            CAP bulletin
          </label>
          <select
            className="w-full rounded-md border bg-background p-2"
            disabled={busy}
            id={`${id}-bulletin`}
            onChange={(event) => {
              setSelection(event.target.value);
              setParts([]);
            }}
            value={selection}
          >
            <option value="">Select a bulletin</option>
            {options.map(({ alert, info, key }) => (
              <option key={key} value={key}>
                {info.headline} — {alert.status} / {alert.msg_type} —{" "}
                {info.language} — {alert.sent}
              </option>
            ))}
          </select>
          {chosen ? (
            <>
              <p className="text-sm">
                Area:{" "}
                {(chosen.info.areas ?? [])
                  .map((area) => area.area_desc)
                  .join(", ") || "Not specified"}
                . Effective: {chosen.info.effective ?? chosen.alert.sent}.
                Onset: {chosen.info.onset ?? "Not specified"}. Expires:{" "}
                {chosen.info.expires ?? "Not specified"}.
              </p>
              {PARTS.filter((part) => chosen.info[part]).map((part) => (
                <label className="flex items-start gap-2 text-sm" key={part}>
                  <input
                    checked={parts.includes(part)}
                    disabled={busy}
                    onChange={(event) =>
                      setParts((current) =>
                        event.target.checked
                          ? [...current, part]
                          : current.filter((value) => value !== part)
                      )
                    }
                    type="checkbox"
                  />
                  <span className="whitespace-pre-wrap">
                    <strong className="capitalize">{part}: </strong>
                    {chosen.info[part]}
                  </span>
                </label>
              ))}
              <label className="block text-sm" htmlFor={`${id}-target`}>
                Add to
              </label>
              <select
                className="w-full rounded-md border bg-background p-2"
                disabled={busy}
                id={`${id}-target`}
                onChange={(event) => setTarget(event.target.value)}
                value={target}
              >
                {targets.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
              <Button
                disabled={busy || !parts.length}
                onClick={insert}
                type="button"
              >
                Add selected text
              </Button>
            </>
          ) : null}
        </>
      ) : null}
      {message ? (
        <p className="text-sm" role="status">
          {message}
        </p>
      ) : null}
    </section>
  );
}
