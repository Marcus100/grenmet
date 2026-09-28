"use client";

import {
  type AttendanceShiftPublic,
  useHrGetAttendanceWeek,
  useHrProposeAttendanceCorrection,
  useHrSaveAttendance,
  useHrSubmitAttendance,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { reportError } from "@/lib/report-error";
import { hrApiErrorMessage } from "../api-error";

const GRENADA = "America/Grenada";

export function localDateTime(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: GRENADA,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(value));
  const part = (key: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === key)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function errorDetail(error: unknown): string {
  return hrApiErrorMessage(error);
}

function AttendanceShift({
  shift,
  refresh,
}: {
  shift: AttendanceShiftPublic;
  refresh: () => Promise<unknown>;
}) {
  const [arrival, setArrival] = useState(
    shift.arrived_at ? localDateTime(shift.arrived_at) : ""
  );
  const [departure, setDeparture] = useState(
    shift.departed_at ? localDateTime(shift.departed_at) : ""
  );
  const [breakMinutes, setBreakMinutes] = useState(shift.break_minutes ?? 0);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState(shift.notes ?? "");
  const [correcting, setCorrecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const save = useHrSaveAttendance();
  const submit = useHrSubmitAttendance();
  const correction = useHrProposeAttendanceCorrection();
  const locked =
    shift.review_status === "PENDING" || shift.review_status === "APPROVED";
  const pending = save.isPending || submit.isPending || correction.isPending;
  const id = shift.roster_assignment_id;
  async function persist(
    review: boolean,
    markedArrival = arrival,
    markedDeparture = departure
  ) {
    setError(null);
    if (!markedArrival || ((review || correcting) && !markedDeparture)) {
      setError(
        "Record arrival and departure before requesting supervisor review"
      );
      return;
    }
    if (correcting && !reason.trim()) {
      setError("Explain why the recorded time needs correction");
      return;
    }
    const body = {
      roster_assignment_id: id,
      expected_revision: shift.revision ?? 0,
      arrived_at: `${markedArrival}:00-04:00`,
      departed_at: markedDeparture ? `${markedDeparture}:00-04:00` : null,
      break_minutes: breakMinutes,
      notes: notes.trim() || null,
    };
    try {
      if (correcting && shift.attendance_id && body.departed_at) {
        await correction.mutateAsync({
          path: { attendance_id: shift.attendance_id },
          body: {
            ...body,
            departed_at: body.departed_at,
            reason: reason.trim(),
          },
        });
        setCorrecting(false);
        toast.success(
          "Correction sent for supervisor review; original time is preserved"
        );
      } else {
        const saved = await save.mutateAsync({ body });
        if (review && saved.attendance_id) {
          await submit.mutateAsync({
            path: { attendance_id: saved.attendance_id },
            body: { expected_revision: saved.revision ?? 1 },
          });
        }
        toast.success(
          review ? "Shift sent for supervisor review" : "Attendance saved"
        );
      }
      await refresh();
    } catch (caught) {
      reportError(caught, "hr-attendance");
      setError(errorDetail(caught));
    }
  }
  return (
    <article className="space-y-4 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-semibold text-sm">
            {shift.shift_date} · {shift.shift_code} · {shift.employee_name}
          </h3>
          <p className="text-muted-foreground text-xs">
            Scheduled {localDateTime(shift.scheduled_start).replace("T", " ")}{" "}
            to {localDateTime(shift.scheduled_end).replace("T", " ")} (Grenada)
          </p>
        </div>
        <span className="text-sm">
          {shift.review_status ??
            (shift.arrived_at ? "Not submitted" : "Not recorded")}
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-4">
        <div className="space-y-1">
          <Label htmlFor={`${id}-arrival`}>Arrival</Label>
          <Input
            disabled={locked && !correcting}
            id={`${id}-arrival`}
            onChange={(event) => setArrival(event.target.value)}
            type="datetime-local"
            value={arrival}
          />
          {!arrival && (
            <Button
              disabled={pending}
              onClick={() => {
                const marked = localDateTime(new Date().toISOString());
                setArrival(marked);
                persist(false, marked, departure);
              }}
              size="sm"
              variant="outline"
            >
              Mark arrival now
            </Button>
          )}
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${id}-departure`}>Departure</Label>
          <Input
            disabled={locked && !correcting}
            id={`${id}-departure`}
            onChange={(event) => setDeparture(event.target.value)}
            type="datetime-local"
            value={departure}
          />
          {!departure && (
            <Button
              disabled={pending || !arrival}
              onClick={() => {
                const marked = localDateTime(new Date().toISOString());
                setDeparture(marked);
                persist(false, arrival, marked);
              }}
              size="sm"
              variant="outline"
            >
              Mark departure now
            </Button>
          )}
        </div>
        <div className="w-32 space-y-1">
          <Label htmlFor={`${id}-break`}>Break minutes</Label>
          <Input
            disabled={locked && !correcting}
            id={`${id}-break`}
            max={1440}
            min={0}
            onChange={(event) => setBreakMinutes(Number(event.target.value))}
            type="number"
            value={breakMinutes}
          />
        </div>
        <p className="text-muted-foreground text-sm">
          Elapsed: {shift.elapsed_hours ?? "—"} h · Recorded work:{" "}
          {shift.actual_hours ?? "—"} h
        </p>
      </div>
      {correcting && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-reason`}>Correction reason</Label>
          <Input
            id={`${id}-reason`}
            maxLength={500}
            onChange={(event) => setReason(event.target.value)}
            value={reason}
          />
        </div>
      )}
      {!correcting && (
        <div className="space-y-1">
          <Label htmlFor={`${id}-remarks`}>Shift remarks</Label>
          <Input
            disabled={locked}
            id={`${id}-remarks`}
            maxLength={500}
            onChange={(event) => setNotes(event.target.value)}
            value={notes}
          />
        </div>
      )}
      {error && (
        <p className="text-destructive text-sm" role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {locked && !correcting ? (
          <Button
            onClick={() => setCorrecting(true)}
            size="sm"
            variant="outline"
          >
            Propose time correction
          </Button>
        ) : (
          <>
            {!correcting && (
              <Button
                disabled={pending}
                onClick={() => persist(false)}
                size="sm"
                variant="outline"
              >
                Save attendance
              </Button>
            )}
            <Button disabled={pending} onClick={() => persist(true)} size="sm">
              {correcting
                ? "Send correction for review"
                : "Submit shift for review"}
            </Button>
          </>
        )}
        {correcting && (
          <Button
            onClick={() => setCorrecting(false)}
            size="sm"
            variant="ghost"
          >
            Cancel correction
          </Button>
        )}
      </div>
    </article>
  );
}

export function AttendanceTimesheet() {
  const [day, setDay] = useState(() =>
    localDateTime(new Date().toISOString()).slice(0, 10)
  );
  const week = useHrGetAttendanceWeek({ query: { day } });
  useEffect(() => {
    if (week.error) reportError(week.error, "hr-attendance");
  }, [week.error]);
  return (
    <section
      aria-label="Shift attendance and weekly timesheet"
      className="space-y-4"
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="font-semibold text-lg">My shift attendance</h2>
          <p className="text-muted-foreground text-sm">
            Record your actual arrival, departure and break duration. Each
            completed shift goes to your supervisor.
          </p>
        </div>
        <div className="space-y-1">
          <Label htmlFor="attendance-week">Week containing</Label>
          <Input
            id="attendance-week"
            onChange={(event) => setDay(event.target.value)}
            type="date"
            value={day}
          />
        </div>
      </div>
      {week.isLoading && <p>Loading published shifts…</p>}
      {week.error && (
        <p className="text-destructive text-sm" role="alert">
          {errorDetail(week.error)}
        </p>
      )}
      {week.data && (
        <>
          <a
            className="text-primary text-sm underline"
            href={`/api/v1/hr/attendance/week/pdf?day=${encodeURIComponent(day)}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            View weekly Python PDF
          </a>
          <p className="text-sm">
            Sunday {week.data.period_start} to Saturday {week.data.period_end} ·
            Supervisor-approved work: {week.data.approved_hours} h · All
            recorded work: {week.data.recorded_hours} h
          </p>
          <p className="text-muted-foreground text-xs">
            Overnight shifts stay with their scheduled start date. D shift is
            recorded once; M/E reports reference the same attendance. Hours
            shown do not determine pay or overtime.
          </p>
          {week.data.shifts.length === 0 && (
            <p className="rounded-lg border p-4 text-sm">
              No published work shifts for this week. Contact your supervisor if
              a scheduled shift is missing.
            </p>
          )}
          {week.data.shifts.map((shift) => (
            <AttendanceShift
              key={`${shift.roster_assignment_id}-${shift.revision}-${shift.review_status}`}
              refresh={week.refetch}
              shift={shift}
            />
          ))}
        </>
      )}
    </section>
  );
}
