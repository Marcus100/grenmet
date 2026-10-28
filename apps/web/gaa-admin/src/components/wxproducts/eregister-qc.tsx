"use client";

import {
  eregisterAcceptRegisterObservation,
  eregisterListRegisterObservations,
  eregisterRejectRegisterObservation,
  eregisterReopenRegisterObservation,
  eregisterReviewRegisterObservation,
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
import { useCallback, useEffect, useState } from "react";
import { SectionCard } from "./eregister-ui";

export type QcState = RegisterObservationRead["state"];
export type QcAction = "accept" | "reject" | "reopen" | "review";
type ReviewOutcome = "reviewed" | "query";

const STATE_LABEL: Record<QcState, string> = {
  accepted: "Accepted",
  draft: "Awaiting acceptance",
  qc_pending: "Awaiting acceptance",
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
  review: false,
};

const MIN_REASON = 3;
export const PAGE_SIZE = 10;
const STATION = "78958";

const DIALOG_COPY: Record<
  QcAction,
  { confirm: string; text: string; title: string }
> = {
  accept: {
    confirm: "Accept observation",
    text: "Accepting sends the observation to WIS2 and email now; nobody else has to approve it first. Add a note if useful.",
    title: "Accept this observation?",
  },
  reject: {
    confirm: "Reject observation",
    text: "A rejected observation is never sent or shown publicly. Say what is wrong so the observer can correct it.",
    title: "Reject this observation?",
  },
  reopen: {
    confirm: "Reopen observation",
    text: "The observation goes back to awaiting acceptance. Say why it is being reopened.",
    title: "Reopen this observation?",
  },
  review: {
    confirm: "Save review",
    text: "A review is a second look. It is shown on the record and never holds back WIS2 or email.",
    title: "Review this observation",
  },
};

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
    if (detail && typeof detail === "object" && "message" in detail) {
      const { message } = detail as { message: unknown };
      if (typeof message === "string") return message;
    }
  }
  if (status === 403) {
    return "You need an eRegister permission, and cannot review your own observation.";
  }
  return "The decision could not be saved. Try again.";
}

function utcLabel(iso: string): string {
  const stamp = iso.endsWith("Z") ? iso : `${iso}Z`;
  return new Date(stamp).toISOString().slice(0, 16).replace("T", " ");
}

function decide(
  action: QcAction,
  id: string,
  reason: string,
  outcome: ReviewOutcome,
  seenUpdatedAt: string
) {
  const path = { observation_id: id };
  const text = reason.trim() || null;
  if (action === "review") {
    return eregisterReviewRegisterObservation({
      body: { note: text, outcome, updated_at: seenUpdatedAt },
      path,
      throwOnError: false as const,
    });
  }
  const options = {
    body: { reason: text },
    path,
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
  const [outcome, setOutcome] = useState<ReviewOutcome>("reviewed");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const copy = DIALOG_COPY[action];
  const needsReason =
    REASON_REQUIRED[action] || (action === "review" && outcome === "query");
  const tooShort = needsReason && reason.trim().length < MIN_REASON;

  const submit = () => {
    setPending(true);
    setError(null);
    decide(action, observation.id, reason, outcome, observation.updated_at)
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
        {action === "review" ? (
          <fieldset className="flex gap-4 text-sm">
            <legend className="sr-only">Review outcome</legend>
            {(["reviewed", "query"] as const).map((value) => (
              <label className="flex items-center gap-1.5" key={value}>
                <input
                  checked={outcome === value}
                  name="review-outcome"
                  onChange={() => setOutcome(value)}
                  type="radio"
                />
                {value === "reviewed" ? "Reviewed" : "Query"}
              </label>
            ))}
          </fieldset>
        ) : null}
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
  const warnings = (observation.issues ?? []).filter(
    (issue) => issue.severity === "warning"
  );
  return (
    <div className="min-w-0 flex-1 space-y-1">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium tabular-nums">
          {utcLabel(observation.observed_at)} UTC
        </span>
        <QcBadge state={observation.state} />
        <span className="text-muted-foreground text-xs">
          Recorded by {observation.actor_name ?? "an unknown user"}
        </span>
      </div>
      {observation.coded ? (
        <code className="block overflow-x-auto whitespace-nowrap rounded bg-muted px-2 py-1 font-mono text-xs tabular-nums">
          {observation.coded}
        </code>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="list-disc pl-5 text-warning text-xs">
          {warnings.map((issue) => (
            <li key={`${issue.field}-${issue.code}`}>{issue.message}</li>
          ))}
        </ul>
      ) : null}
      {observation.review_outcome ? (
        <p className="text-muted-foreground text-xs">
          {observation.review_outcome === "query" ? "Query" : "Reviewed"}
          {observation.review_note ? `: ${observation.review_note}` : ""}
        </p>
      ) : null}
      {observation.qc_notes ? (
        <p className="text-muted-foreground text-xs">{observation.qc_notes}</p>
      ) : null}
    </div>
  );
}

type QueueStatus = "loading" | "ready" | "error";

interface QueueQuery {
  reviewed?: boolean;
  state: string;
}

/** One server-side queue: the rows of the current page and the total. */
function useQueue(query: QueueQuery, refresh: number) {
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<RegisterObservationRead[]>([]);
  const [total, setTotal] = useState(0);
  const [status, setStatus] = useState<QueueStatus>("loading");
  const { reviewed, state } = query;

  useEffect(() => {
    let active = true;
    // The refresh counter re-runs this effect after a decision.
    if (refresh < 0) return;
    setStatus("loading");
    eregisterListRegisterObservations({
      query: {
        kind: "SYNOP",
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
        reviewed,
        state,
        station_id: STATION,
      },
      throwOnError: false,
    })
      .then((result) => {
        if (!active) return;
        if (result.error || !result.data) {
          setStatus("error");
          return;
        }
        setItems(result.data.observations);
        setTotal(result.data.total ?? result.data.observations.length);
        setStatus("ready");
      })
      .catch(() => {
        if (active) setStatus("error");
      });
    return () => {
      active = false;
    };
  }, [page, refresh, reviewed, state]);

  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  // A page emptied by decisions steps back instead of showing nothing.
  useEffect(() => {
    if (status === "ready" && items.length === 0 && page > 0) {
      setPage(page - 1);
    }
  }, [status, items.length, page]);
  return { items, page, pages, setPage, status, total };
}

function Pager({
  page,
  pages,
  setPage,
}: {
  page: number;
  pages: number;
  setPage: (page: number) => void;
}) {
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-between gap-2 border-t px-4 py-2 text-xs">
      <Button
        disabled={page === 0}
        onClick={() => setPage(page - 1)}
        size="sm"
        variant="outline"
      >
        Previous
      </Button>
      <span className="text-muted-foreground">
        {`Page ${page + 1} of ${pages}`}
      </span>
      <Button
        disabled={page >= pages - 1}
        onClick={() => setPage(page + 1)}
        size="sm"
        variant="outline"
      >
        Next
      </Button>
    </div>
  );
}

interface RowAction {
  action: QcAction;
  disabled?: boolean;
  label: string;
}

function QueueSection({
  actions,
  empty,
  heading,
  onAct,
  query,
  refresh,
  userId,
}: {
  actions: (item: RegisterObservationRead, own: boolean) => RowAction[];
  empty: string;
  heading: string;
  onAct: (action: QcAction, observation: RegisterObservationRead) => void;
  query: QueueQuery;
  refresh: number;
  userId: string;
}) {
  const { items, page, pages, setPage, status, total } = useQueue(
    query,
    refresh
  );
  return (
    <section aria-label={heading}>
      <p className="border-b px-4 py-2 font-medium text-muted-foreground text-xs uppercase tracking-wide">
        {heading} ({status === "ready" ? total : "…"})
      </p>
      {status === "error" ? (
        <p className="px-4 py-3 text-destructive text-sm" role="alert">
          This list could not be loaded.
        </p>
      ) : null}
      {status === "ready" && items.length === 0 ? (
        <p className="px-4 py-3 text-muted-foreground text-sm" role="status">
          {empty}
        </p>
      ) : null}
      <ul className="divide-y">
        {items.map((item) => {
          const own = item.actor_id === userId;
          return (
            <li
              className="flex flex-wrap items-start gap-3 px-4 py-2"
              key={item.id}
            >
              <ObservationLine observation={item} />
              <div className="flex flex-col items-end gap-1">
                {own && query.reviewed === false ? (
                  <span className="text-muted-foreground text-xs">
                    Your observation: another person reviews it
                  </span>
                ) : null}
                <div className="flex gap-2">
                  {actions(item, own).map((entry) => (
                    <Button
                      disabled={entry.disabled}
                      key={entry.action}
                      onClick={() => onAct(entry.action, item)}
                      size="sm"
                      variant={
                        entry.action === "accept" ? "default" : "outline"
                      }
                    >
                      {entry.label}
                    </Button>
                  ))}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
      <Pager page={page} pages={pages} setPage={setPage} />
    </section>
  );
}

/**
 * Register queues, read from the server by state (not from the page's last
 * rows): observations awaiting acceptance, and accepted observations nobody
 * has reviewed yet. The observer accepts alone; a review by someone else is
 * optional and never holds anything back. The server is authoritative; the
 * buttons only mirror what it will accept.
 */
export function QcQueue({
  onDecided,
  userId,
}: {
  onDecided: (updated: RegisterObservationRead) => void;
  userId: string;
}) {
  const [active, setActive] = useState<{
    action: QcAction;
    observation: RegisterObservationRead;
  } | null>(null);
  const [refresh, setRefresh] = useState(0);
  const decided = useCallback(
    (updated: RegisterObservationRead) => {
      setRefresh((value) => value + 1);
      onDecided(updated);
    },
    [onDecided]
  );
  const onAct = (action: QcAction, observation: RegisterObservationRead) =>
    setActive({ action, observation });

  return (
    <SectionCard title="Acceptance and review">
      <QueueSection
        actions={() => [
          { action: "accept", label: "Accept" },
          { action: "reject", label: "Reject" },
        ]}
        empty="No observations are waiting for acceptance."
        heading="Awaiting acceptance"
        onAct={onAct}
        query={{ state: "draft,qc_pending" }}
        refresh={refresh}
        userId={userId}
      />
      <QueueSection
        actions={(_item, own) => [
          { action: "review", disabled: own, label: "Review" },
          { action: "reopen", label: "Reopen" },
        ]}
        empty="No accepted observations are waiting for a review."
        heading="Review queue"
        onAct={onAct}
        query={{ reviewed: false, state: "accepted" }}
        refresh={refresh}
        userId={userId}
      />
      {active ? (
        <DecisionDialog
          action={active.action}
          observation={active.observation}
          onClose={() => setActive(null)}
          onDecided={decided}
        />
      ) : null}
    </SectionCard>
  );
}
