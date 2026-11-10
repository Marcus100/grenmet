"use client";

import {
  type ApiError,
  type EregisterValidationError,
  eregisterOverrideRegisterObservationBufr,
  type RegisterObservationRead,
  useAuthGetEffectiveAccess,
  type ValidationErrorResponse,
} from "@barrelsgd/api-client";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@barrelsgd/ui/components/ui/dialog";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useState } from "react";

/** The API's reason limits, after the server's cleaning (the server has the last word). */
export const OVERRIDE_REASON_MIN = 10;
export const OVERRIDE_REASON_MAX = 500;

const FALLBACK_PROBLEM = "the BUFR check did not pass";

/** What the server stores on a reviewer override (`bufr.override`). */
export interface BufrOverrideRecord {
  at: string;
  by_name: string | null;
  reason: string;
}

interface OverrideResult {
  data?: RegisterObservationRead;
  error?: ApiError | EregisterValidationError | ValidationErrorResponse;
  response?: Response;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Why the BUFR record failed, in words; null when there is no failed BUFR check. */
export function bufrProblem(
  observation: RegisterObservationRead
): string | null {
  if (observation.kind !== "SYNOP" || !isRecord(observation.bufr)) return null;
  if (observation.bufr.valid === true) return null;
  const errors = Array.isArray(observation.bufr.errors)
    ? observation.bufr.errors.filter(
        (item): item is string => typeof item === "string"
      )
    : [];
  return errors.length > 0 ? errors.slice(0, 3).join("; ") : FALLBACK_PROBLEM;
}

/** The reviewer override on the record, when the server stored one. */
export function bufrOverride(
  observation: RegisterObservationRead
): BufrOverrideRecord | null {
  const override = isRecord(observation.bufr)
    ? observation.bufr.override
    : undefined;
  if (!isRecord(override) || typeof override.reason !== "string") return null;
  return {
    at: typeof override.at === "string" ? override.at : "",
    by_name: typeof override.by_name === "string" ? override.by_name : null,
    reason: override.reason,
  };
}

/** The override's time, in UTC. The server writes an offset (`+00:00`). */
function utcLabel(iso: string): string {
  const moment = new Date(iso);
  if (!iso || Number.isNaN(moment.getTime())) return "an unknown time";
  return `${moment.toISOString().slice(0, 16).replace("T", " ")} UTC`;
}

function overrideError(result: OverrideResult): string {
  const { error, response } = result;
  if (error && typeof error === "object" && "detail" in error) {
    const { detail } = error as { detail: unknown };
    if (typeof detail === "string") return detail;
  }
  if (response?.status === 403) {
    return "Only an eRegister QC reviewer other than the observer can override this check.";
  }
  return "The override could not be recorded. Try again.";
}

function OverrideDialog({
  observation,
  onClose,
  onOverridden,
  problem,
}: {
  observation: RegisterObservationRead;
  onClose: () => void;
  onOverridden: (updated: RegisterObservationRead) => void;
  problem: string;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const trimmed = reason.trim();
  const tooShort = trimmed.length < OVERRIDE_REASON_MIN;

  const submit = () => {
    setPending(true);
    setError(null);
    eregisterOverrideRegisterObservationBufr({
      body: { reason: trimmed },
      path: { observation_id: observation.id },
      throwOnError: false as const,
    })
      .then((result: OverrideResult) => {
        if (result.error || !result.data) {
          setError(overrideError(result));
          return;
        }
        onOverridden(result.data);
        onClose();
      })
      .catch(() => setError("The override could not be recorded. Try again."))
      .finally(() => setPending(false));
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Send anyway as reviewer?</DialogTitle>
          <DialogDescription>
            The BUFR check failed: {problem}. Recording this lets email and WIS2
            send this observation as it is. The BUFR message and its check
            result do not change, and the record shows who recorded the
            override, when, and why. A correction ends it.
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5 text-sm" htmlFor="bufr-override-reason">
          <span className="font-medium">
            Reason (required, 10 to 500 characters)
          </span>
          <Textarea
            id="bufr-override-reason"
            maxLength={OVERRIDE_REASON_MAX}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            value={reason}
          />
        </label>
        {error ? (
          <p className="text-destructive text-sm" role="alert">
            {error}
          </p>
        ) : null}
        <DialogFooter>
          <Button onClick={onClose} variant="outline">
            Cancel
          </Button>
          <Button disabled={pending || tooShort} onClick={submit}>
            {pending ? "Recording…" : "Record override and allow sending"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The override action, shown only to a QC reviewer who is not the observer. */
function OverrideAction({
  observation,
  onOverridden,
  problem,
}: {
  observation: RegisterObservationRead;
  onOverridden: (updated: RegisterObservationRead) => void;
  problem: string;
}) {
  const [open, setOpen] = useState(false);
  const access = useAuthGetEffectiveAccess();
  // The server re-checks every call; this only hides an action it would refuse.
  const canReview =
    access.data?.is_superuser === true ||
    access.data?.permission_keys.includes("eregister.qc") === true;
  if (!canReview) return null;
  return (
    <>
      <Button onClick={() => setOpen(true)} size="sm" variant="outline">
        Send anyway (reviewer)
      </Button>
      {open ? (
        <OverrideDialog
          observation={observation}
          onClose={() => setOpen(false)}
          onOverridden={onOverridden}
          problem={problem}
        />
      ) : null}
    </>
  );
}

/**
 * A failed BUFR check on a row: the reason, the recorded reviewer override (who,
 * when, why), and the reviewer's action. Renders nothing when the BUFR passed.
 * `userId` is the signed-in user: the observer never sees the action.
 */
export function BufrCheck({
  observation,
  onOverridden,
  userId,
}: {
  observation: RegisterObservationRead;
  onOverridden: (updated: RegisterObservationRead) => void;
  userId: string;
}) {
  const problem = bufrProblem(observation);
  if (problem === null) return null;
  const override = bufrOverride(observation);
  return (
    <div className="basis-full space-y-1 text-xs">
      <p className="text-destructive" role="status">
        BUFR check failed, so this observation cannot be sent: {problem}
      </p>
      {override ? (
        <p className="text-muted-foreground">
          Sent-anyway override by {override.by_name ?? "a reviewer"} at{" "}
          {utcLabel(override.at)}: {override.reason}
        </p>
      ) : null}
      {!override && observation.actor_id !== userId ? (
        <OverrideAction
          observation={observation}
          onOverridden={onOverridden}
          problem={problem}
        />
      ) : null}
    </div>
  );
}
