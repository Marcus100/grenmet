"use client";

import {
  eregisterAcceptRegisterObservation,
  eregisterRejectRegisterObservation,
  eregisterReopenRegisterObservation,
  type RegisterObservationRead,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
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
import { SectionCard } from "./eregister-ui";

export type QcState = RegisterObservationRead["state"];
export type QcAction = "accept" | "reject" | "reopen";

const STATE_LABEL: Record<QcState, string> = {
  accepted: "Accepted",
  draft: "Awaiting QC",
  qc_pending: "Awaiting QC",
  rejected: "Rejected",
  superseded: "Superseded",
};

const STATE_VARIANT: Record<
  QcState,
  "light-success" | "light-error" | "light-warning" | "light-light"
> = {
  accepted: "light-success",
  draft: "light-warning",
  qc_pending: "light-warning",
  rejected: "light-error",
  superseded: "light-light",
};

const REASON_REQUIRED: Record<QcAction, boolean> = {
  accept: false,
  reject: true,
  reopen: true,
};

const MIN_REASON = 3;

const DIALOG_COPY: Record<
  QcAction,
  { confirm: string; text: string; title: string }
> = {
  accept: {
    confirm: "Accept observation",
    text: "Accepted observations can be published to WIS2 and show as final on the public page. Add a note if useful.",
    title: "Accept this observation?",
  },
  reject: {
    confirm: "Reject observation",
    text: "A rejected observation is never sent or shown publicly. Say what is wrong so the observer can correct it.",
    title: "Reject this observation?",
  },
  reopen: {
    confirm: "Reopen observation",
    text: "The observation goes back to the QC queue. Say why it is being reopened.",
    title: "Reopen this observation?",
  },
};

const PENDING: readonly QcState[] = ["draft", "qc_pending"];
const DECIDED: readonly QcState[] = ["accepted", "rejected"];

export function QcBadge({ state }: { state: QcState }) {
  return <Badge variant={STATE_VARIANT[state]}>{STATE_LABEL[state]}</Badge>;
}

export function decisionError(
  error: unknown,
  status: number | undefined
): string {
  if (error && typeof error === "object" && "detail" in error) {
    const { detail } = error as { detail: unknown };
    if (typeof detail === "string") return detail;
  }
  if (status === 403) {
    return "You need the eRegister QC permission, and cannot accept your own observation.";
  }
  return "The decision could not be saved. Try again.";
}

function utcLabel(iso: string): string {
  const stamp = iso.endsWith("Z") ? iso : `${iso}Z`;
  return new Date(stamp).toISOString().slice(0, 16).replace("T", " ");
}

function decide(action: QcAction, id: string, reason: string) {
  const options = {
    body: { reason: reason.trim() || null },
    path: { observation_id: id },
    throwOnError: false as const,
  };
  if (action === "accept") return eregisterAcceptRegisterObservation(options);
  if (action === "reject") return eregisterRejectRegisterObservation(options);
  return eregisterReopenRegisterObservation(options);
}

function DecisionDialog({
  action,
  onClose,
  onDecided,
  observation,
}: {
  action: QcAction;
  observation: RegisterObservationRead;
  onClose: () => void;
  onDecided: (updated: RegisterObservationRead) => void;
}) {
  const [reason, setReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = DIALOG_COPY[action];
  const needsReason = REASON_REQUIRED[action];
  const tooShort = needsReason && reason.trim().length < MIN_REASON;

  const submit = () => {
    setPending(true);
    setError(null);
    decide(action, observation.id, reason)
      .then((result) => {
        if (result.error || !result.data) {
          setError(decisionError(result.error, result.response?.status));
          return;
        }
        onDecided(result.data);
        onClose();
      })
      .catch(() => setError("The decision could not be saved. Try again."))
      .finally(() => setPending(false));
  };

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>
            {copy.text} Observation {utcLabel(observation.observed_at)} UTC.
          </DialogDescription>
        </DialogHeader>
        <label className="grid gap-1.5 text-sm" htmlFor="qc-reason">
          <span className="font-medium">
            {needsReason ? "Reason (required)" : "Note (optional)"}
          </span>
          <Textarea
            id="qc-reason"
            maxLength={1000}
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
            {pending ? "Saving…" : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ObservationLine({
  observation,
}: {
  observation: RegisterObservationRead;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium tabular-nums">
          {utcLabel(observation.observed_at)} UTC
        </span>
        <QcBadge state={observation.state} />
      </div>
      {observation.qc_notes ? (
        <p className="text-muted-foreground text-xs">{observation.qc_notes}</p>
      ) : null}
    </div>
  );
}

/**
 * QC panel: observations waiting for a decision, and recent decisions that can
 * be reopened. The server is authoritative (permission `eregister.qc`,
 * four-eyes, validation); the buttons only mirror what it will accept.
 */
export function QcQueue({
  observations,
  onDecided,
  userId,
}: {
  observations: readonly RegisterObservationRead[];
  onDecided: (updated: RegisterObservationRead) => void;
  userId: string;
}) {
  const [active, setActive] = useState<{
    action: QcAction;
    observation: RegisterObservationRead;
  } | null>(null);
  const synops = observations.filter((item) => item.kind === "SYNOP");
  const pending = synops.filter((item) => PENDING.includes(item.state));
  const decided = synops
    .filter((item) => DECIDED.includes(item.state))
    .slice(0, 5);

  return (
    <SectionCard title={`QC queue (${pending.length})`}>
      {pending.length === 0 ? (
        <p className="px-4 py-3 text-muted-foreground text-sm" role="status">
          No observations are waiting for QC.
        </p>
      ) : (
        <ul className="divide-y">
          {pending.map((item) => {
            const own = item.actor_id === userId;
            return (
              <li
                className="flex flex-wrap items-center gap-3 px-4 py-2"
                key={item.id}
              >
                <ObservationLine observation={item} />
                {own ? (
                  <span className="text-muted-foreground text-xs">
                    Your observation: another person must accept it
                  </span>
                ) : null}
                <div className="flex gap-2">
                  <Button
                    disabled={own}
                    onClick={() =>
                      setActive({ action: "accept", observation: item })
                    }
                    size="sm"
                  >
                    Accept
                  </Button>
                  <Button
                    onClick={() =>
                      setActive({ action: "reject", observation: item })
                    }
                    size="sm"
                    variant="outline"
                  >
                    Reject
                  </Button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {decided.length > 0 ? (
        <div className="border-t">
          <p className="px-4 pt-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
            Recent decisions
          </p>
          <ul className="divide-y">
            {decided.map((item) => (
              <li
                className="flex flex-wrap items-center gap-3 px-4 py-2"
                key={item.id}
              >
                <ObservationLine observation={item} />
                <Button
                  onClick={() =>
                    setActive({ action: "reopen", observation: item })
                  }
                  size="sm"
                  variant="outline"
                >
                  Reopen
                </Button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {active ? (
        <DecisionDialog
          action={active.action}
          observation={active.observation}
          onClose={() => setActive(null)}
          onDecided={onDecided}
        />
      ) : null}
    </SectionCard>
  );
}
