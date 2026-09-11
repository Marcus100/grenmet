"use client";

import {
  archiveTrainingRecordApiV1HrTrainingRecordsRecordIdArchivePost,
  createTrainingRecordApiV1HrTrainingRecordsPost,
  readTrainingRecordsApiV1HrTrainingRecordsGet,
  type TrainingRecordPublic,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Input } from "@barrelsgd/ui/components/ui/input";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { ExpiryBadge, grenadaToday } from "@/components/hr/expiry";

export function TrainingRecords({
  userId,
  organisationId,
}: {
  userId: string;
  organisationId: string;
}) {
  const id = useId();
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [adding, setAdding] = useState(false);
  const [archive, setArchive] = useState<TrainingRecordPublic | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const today = grenadaToday();
  const query = useQuery({
    queryKey: [
      "training-records",
      organisationId,
      userId,
      page,
      includeArchived,
    ],
    queryFn: () =>
      readTrainingRecordsApiV1HrTrainingRecordsGet({
        query: {
          organisation_id: organisationId,
          user_id: userId,
          page,
          size: 20,
          include_archived: includeArchived,
        },
      }).unwrap(),
  });
  async function refresh() {
    await client.invalidateQueries({
      queryKey: ["training-records", organisationId, userId],
    });
    setAdding(false);
    setArchive(null);
  }
  return (
    <section aria-label="Employee training history" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-medium text-xl">Training history</h2>
        {query.isSuccess && query.data.can_create && (
          <Button
            disabled={adding || busy}
            onClick={() => {
              setAdding(true);
              setError("");
            }}
          >
            Add training record
          </Button>
        )}
      </div>
      <p className="text-muted-foreground text-sm">
        Training outcomes recorded by HR. Completion does not certify competency
        for a duty.
      </p>
      <label className="flex items-center gap-2 text-sm">
        <input
          checked={includeArchived}
          onChange={(event) => {
            setIncludeArchived(event.target.checked);
            setPage(1);
          }}
          type="checkbox"
        />
        Include archived records
      </label>
      {adding && (
        <form
          aria-label="Add training record"
          className="grid gap-4 rounded-lg border border-border p-4 md:grid-cols-2"
          onSubmit={async (event) => {
            event.preventDefault();
            setError("");
            const values = new FormData(event.currentTarget);
            const result = String(values.get("result"));
            if (
              result !== "completed" &&
              result !== "attended" &&
              result !== "failed"
            )
              return;
            const completed = String(values.get("completed_on"));
            const expiry = String(values.get("expires_on") || "");
            if (
              completed > today ||
              (expiry && (expiry < completed || result !== "completed"))
            ) {
              setError(
                "Use a past or current training date. Expiry requires successful completion and cannot precede it."
              );
              return;
            }
            setBusy(true);
            try {
              await createTrainingRecordApiV1HrTrainingRecordsPost({
                body: {
                  organisation_id: organisationId,
                  user_id: userId,
                  course_name: String(values.get("course_name")).trim(),
                  provider: String(values.get("provider")).trim(),
                  completed_on: completed,
                  result,
                  expires_on: expiry || null,
                  notes: String(values.get("notes") || "").trim() || null,
                },
              }).unwrap();
              setPage(1);
              await refresh();
            } catch {
              setError(
                "Unable to save training. Check the details and your access, then retry."
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <label htmlFor={`${id}-course`}>
            Course name
            <Input
              id={`${id}-course`}
              maxLength={200}
              name="course_name"
              required
            />
          </label>
          <label htmlFor={`${id}-provider`}>
            Training provider
            <Input
              id={`${id}-provider`}
              maxLength={200}
              name="provider"
              required
            />
          </label>
          <label htmlFor={`${id}-date`}>
            Training end date
            <Input
              id={`${id}-date`}
              max={today}
              name="completed_on"
              required
              type="date"
            />
          </label>
          <label htmlFor={`${id}-result`}>
            Result
            <select
              className="block w-full rounded-md border border-input bg-background p-2"
              id={`${id}-result`}
              name="result"
            >
              <option value="completed">Successfully completed</option>
              <option value="attended">Attended only</option>
              <option value="failed">Not passed</option>
            </select>
          </label>
          <label htmlFor={`${id}-expiry`}>
            Certificate expiry (optional)
            <Input id={`${id}-expiry`} name="expires_on" type="date" />
          </label>
          <label htmlFor={`${id}-notes`}>
            Notes (optional)
            <Input id={`${id}-notes`} maxLength={2000} name="notes" />
          </label>
          <div className="flex gap-2">
            <Button disabled={busy} type="submit">
              {busy ? "Saving…" : "Save training record"}
            </Button>
            <Button
              disabled={busy}
              onClick={() => {
                setAdding(false);
                setError("");
              }}
              type="button"
              variant="outline"
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
      {query.isPending && <p role="status">Loading training history…</p>}
      {query.isError && (
        <div role="alert">
          <p>Unable to load training history.</p>
          <Button onClick={() => query.refetch()} variant="outline">
            Retry
          </Button>
        </div>
      )}
      {query.isSuccess && (
        <>
          {!query.data.data.length && <p>No training records found.</p>}
          <ul className="space-y-3">
            {query.data.data.map((record) => (
              <li
                className="space-y-2 rounded-lg border border-border p-4"
                key={record.id}
              >
                <h3 className="font-medium">{record.course_name}</h3>
                <p className="text-sm">
                  {record.provider} · {record.completed_on} · {record.result}
                </p>
                <ExpiryBadge
                  archived={Boolean(record.archived_at)}
                  date={record.expires_on}
                  today={today}
                />
                {record.expires_on && (
                  <p className="text-sm">
                    Certificate expiry: {record.expires_on}
                  </p>
                )}
                {record.notes && <p className="text-sm">{record.notes}</p>}
                {record.archive_reason && (
                  <p className="text-sm">
                    Archive reason: {record.archive_reason}
                  </p>
                )}
                {record.can_manage && !record.archived_at && (
                  <Button
                    disabled={busy}
                    onClick={() => {
                      setArchive(record);
                      setError("");
                    }}
                    variant="outline"
                  >
                    Archive {record.course_name}
                  </Button>
                )}
              </li>
            ))}
          </ul>
          <div className="flex items-center gap-3">
            <Button
              disabled={page <= 1}
              onClick={() => setPage(page - 1)}
              variant="outline"
            >
              Previous records
            </Button>
            <p className="text-sm">
              Page {page} of {Math.max(1, Math.ceil(query.data.count / 20))} ·{" "}
              {query.data.count} records
            </p>
            <Button
              disabled={page * 20 >= query.data.count}
              onClick={() => setPage(page + 1)}
              variant="outline"
            >
              Next records
            </Button>
          </div>
        </>
      )}
      {archive && (
        <form
          aria-label="Archive training record"
          className="space-y-3 rounded-lg border border-border p-4"
          onSubmit={async (event) => {
            event.preventDefault();
            const reason = String(
              new FormData(event.currentTarget).get("reason") || ""
            ).trim();
            if (reason.length < 5) {
              setError("Give an archive reason of at least five characters.");
              return;
            }
            setBusy(true);
            setError("");
            try {
              await archiveTrainingRecordApiV1HrTrainingRecordsRecordIdArchivePost(
                { path: { record_id: archive.id }, body: { reason } }
              ).unwrap();
              if (page > 1 && query.data?.data.length === 1) setPage(page - 1);
              await refresh();
            } catch {
              setError(
                "Unable to archive this training record. Check your access and retry."
              );
            } finally {
              setBusy(false);
            }
          }}
        >
          <p>
            Archive “{archive.course_name}”? The original remains in history.
            Add a replacement record for corrections.
          </p>
          <label htmlFor={`${id}-reason`}>
            Archive reason
            <Input
              id={`${id}-reason`}
              maxLength={500}
              minLength={5}
              name="reason"
              required
            />
          </label>
          <div className="flex gap-2">
            <Button disabled={busy} type="submit">
              Confirm archive
            </Button>
            <Button
              disabled={busy}
              onClick={() => setArchive(null)}
              type="button"
              variant="outline"
            >
              Cancel archive
            </Button>
          </div>
        </form>
      )}
    </section>
  );
}
