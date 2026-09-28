"use client";

import { useHrGetAttendanceReview } from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useEffect, useState } from "react";
import { reportError } from "@/lib/report-error";
import { localDateTime } from "./attendance-timesheet";

export function AttendanceReview({
  entityId,
  correction = false,
}: {
  entityId: string;
  correction?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const review = useHrGetAttendanceReview(
    {
      query: correction
        ? { correction_id: entityId }
        : { attendance_id: entityId },
    },
    { query: { enabled: open } }
  );
  const current = review.data?.current;
  useEffect(() => {
    if (review.error) reportError(review.error, "hr-attendance-review");
  }, [review.error]);
  return (
    <div className="mt-2 space-y-2 text-sm">
      <Button onClick={() => setOpen(!open)} size="sm" variant="outline">
        {open ? "Hide attendance details" : "Review attendance details"}
      </Button>
      {open && review.isLoading && <p>Loading attendance…</p>}
      {open && review.error && (
        <p role="alert">Unable to read attendance. Refresh before approving.</p>
      )}
      {open && current && (
        <div className="space-y-1">
          <p>
            {current.shift_date} · {current.shift_code} ·{" "}
            {current.employee_name}
          </p>
          <p>
            Arrival{" "}
            {current.arrived_at
              ? localDateTime(current.arrived_at).replace("T", " ")
              : "Not recorded"}
            ; departure{" "}
            {current.departed_at
              ? localDateTime(current.departed_at).replace("T", " ")
              : "Not recorded"}{" "}
            (Grenada)
          </p>
          <p>
            Elapsed {current.elapsed_hours ?? "—"} h; break{" "}
            {current.break_minutes} min; recorded work{" "}
            {current.actual_hours ?? "—"} h
          </p>
          {review.data?.corrections.map((proposal) => (
            <div className="rounded border p-2" key={proposal.id}>
              <p className="font-medium">
                Correction · {proposal.review_status ?? "Not submitted"}
              </p>
              <p>
                Proposed arrival{" "}
                {localDateTime(proposal.arrived_at).replace("T", " ")}
                {"; departure "}
                {localDateTime(proposal.departed_at).replace("T", " ")}; break{" "}
                {proposal.break_minutes} min
              </p>
              <p>Reason: {proposal.reason}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
