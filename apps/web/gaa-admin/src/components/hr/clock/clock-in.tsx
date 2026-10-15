"use client";

import { type ClockResult, useHrClock } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useState } from "react";
import { reportError } from "@/lib/report-error";

interface ClockInProps {
  /** Code from the QR link or NFC tag; empty when typed by hand. */
  initialCode?: string;
}

function timeLabel(value: string | null | undefined): string {
  if (!value) return "";
  return new Date(value).toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "America/Grenada",
  });
}

function errorMessage(error: unknown): string {
  const status = (error as { status?: number } | null)?.status;
  if (status === 409) return "You have no rostered shift to clock in to now.";
  if (status === 403) return "This clock point belongs to another department.";
  if (status === 404)
    return "This clock code is not valid. Ask your supervisor.";
  return "Could not record your clock-in. Try again.";
}

function Outcome({ result }: { result: ClockResult }) {
  const arrived = result.action === "ARRIVED";
  const attendance = result.attendance;
  const late = result.late_minutes ?? 0;
  const early = result.early_departure_minutes ?? 0;
  const overtime = result.overtime_minutes ?? 0;
  const notes: string[] = [];
  if (late > 0) notes.push(`${late} min after the shift start`);
  if (early > 0) notes.push(`${early} min before the shift end`);
  if (overtime > 0) notes.push(`${overtime} min after the shift end`);
  return (
    <section
      aria-label="Clock result"
      className="space-y-1 rounded-xl border px-4 py-3 text-sm"
    >
      <p className="font-medium">
        {arrived ? "Arrival recorded" : "Departure recorded"} at{" "}
        {timeLabel(arrived ? attendance.arrived_at : attendance.departed_at)}
      </p>
      <p className="text-muted-foreground">
        {result.site_name} · shift {attendance.shift_code} (
        {timeLabel(attendance.scheduled_start)}–
        {timeLabel(attendance.scheduled_end)})
      </p>
      {notes.length > 0 ? (
        <p className="text-muted-foreground">{notes.join(" · ")}</p>
      ) : null}
      {arrived ? null : (
        <p className="text-muted-foreground">
          Submit this shift for supervisor review from the Time Sheet page.
        </p>
      )}
    </section>
  );
}

export function ClockIn({ initialCode = "" }: ClockInProps) {
  const [code, setCode] = useState(initialCode);
  const [result, setResult] = useState<ClockResult>();
  const [error, setError] = useState<string>();
  const clockMutation = useHrClock();

  async function submit() {
    setError(undefined);
    try {
      setResult(
        await clockMutation.mutateAsync({ body: { token: code.trim() } })
      );
    } catch (caught) {
      reportError(caught, "hr-clock");
      setResult(undefined);
      setError(errorMessage(caught));
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {initialCode ? null : (
        <Field>
          <FieldLabel htmlFor="clock-code">Clock point code</FieldLabel>
          <Input
            autoComplete="off"
            id="clock-code"
            onChange={(event) => setCode(event.target.value)}
            value={code}
          />
          <FieldDescription>
            Scanning the tag or poster fills this in. Type the code only if
            scanning fails.
          </FieldDescription>
        </Field>
      )}
      <Button
        disabled={code.trim().length < 8 || clockMutation.isPending}
        size="lg"
        type="submit"
      >
        Clock in or out
      </Button>
      {error ? (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      ) : null}
      {result ? <Outcome result={result} /> : null}
    </form>
  );
}
