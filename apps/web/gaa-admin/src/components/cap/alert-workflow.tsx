"use client";

import {
  authGetEffectiveAccess,
  type CapAlertPublic,
  type CapValidationResult,
  capApproveAlert,
  capCancelAlert,
  capEmergencyPublishAlert,
  capExpireAlert,
  capGetAlert,
  capPublishAlert,
  capRecordAlertReview,
  capSubmitAlert,
  capValidateAlert,
} from "@barrelsgd/api-client";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { Label } from "@barrelsgd/ui/components/ui/label";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { PageHeader } from "@/components/layout/page-header";
import { can, canAny } from "@/lib/cap-allowed-actions";
import { readSourceBulletinLink } from "@/lib/cap-bulletin-link";

/** The fixed `detail` of the documented request-validation 422. */
const VALIDATION_FALLBACK = "Validation error";

/** The `msg` of each item in a validation `errors` list, joined; else undefined. */
function validationMessages(data: object): string | undefined {
  if (!("errors" in data && Array.isArray(data.errors))) return undefined;
  const messages: string[] = [];
  for (const item of data.errors as unknown[]) {
    if (
      typeof item === "object" &&
      item !== null &&
      "msg" in item &&
      typeof item.msg === "string"
    ) {
      messages.push(item.msg);
    }
  }
  return messages.length > 0 ? messages.join("; ") : undefined;
}

/** A generated-client failure line such as "POST /api/v1/cap/alerts failed with status 422". */
const HTTP_FAILURE = /\bfailed with status \d{3}\b/u;

/**
 * What a CAP request failure says to staff: the API's own detail, or a plain
 * sentence, never a raw HTTP status line (pre-demo review, 10 Nov 2026).
 */
export function errorText(
  error: unknown,
  fallback = "The request failed. Reload the alert before trying again."
): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (data && typeof data === "object" && "detail" in data) {
      if (typeof data.detail === "string") {
        if (data.detail === VALIDATION_FALLBACK) {
          return validationMessages(data) ?? data.detail;
        }
        return data.detail;
      }
      return validationMessages({ errors: data.detail }) ?? fallback;
    }
  }
  return error instanceof Error && !HTTP_FAILURE.test(error.message)
    ? error.message
    : fallback;
}

type WorkflowAction =
  | "validate"
  | "submit"
  | "approve"
  | "reviewed"
  | "changes_requested"
  | "publish"
  | "emergency"
  | "cancel"
  | "expire";

interface LifecycleOptions {
  body: { note: string | null };
  path: { alert_id: string };
}

/** Every non-validate workflow action, keyed for a lookup dispatch instead of an if/else chain. */
const LIFECYCLE_ACTIONS: Record<
  Exclude<WorkflowAction, "validate">,
  (options: LifecycleOptions) => Promise<CapAlertPublic>
> = {
  approve: (options) => capApproveAlert(options).unwrap(),
  // Optional colleague review (owner, 23 Oct 2026); never changes the state.
  reviewed: (options) =>
    capRecordAlertReview({
      path: options.path,
      body: { outcome: "reviewed", note: options.body.note },
    }).unwrap(),
  changes_requested: (options) =>
    capRecordAlertReview({
      path: options.path,
      body: { outcome: "changes_requested", note: options.body.note },
    }).unwrap(),
  cancel: (options) => capCancelAlert(options).unwrap(),
  expire: (options) => capExpireAlert(options).unwrap(),
  emergency: async (options) =>
    (
      await capEmergencyPublishAlert({
        path: options.path,
        body: { reason: options.body.note ?? "" },
      }).unwrap()
    ).alert,
  publish: async (options) => (await capPublishAlert(options).unwrap()).alert,
  submit: (options) => capSubmitAlert(options).unwrap(),
};

/** The confirmation dialogs that guard a publish, cancel or expiry. */
type ConfirmDialog = "cancel" | "emergency" | "expire";

/** One thing at a time: nothing, a request in flight, or one dialog open. */
type Pending =
  | { status: "idle" }
  | { status: "busy" }
  | { status: "confirm"; dialog: ConfirmDialog };

const IDLE: Pending = { status: "idle" };
const BUSY: Pending = { status: "busy" };

export function AlertWorkflow({ alertId }: { alertId: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const queryKey = ["cap", "authoring", alertId];
  const alertQuery = useQuery({
    queryKey,
    queryFn: () =>
      capGetAlert({
        path: { alert_id: alertId },
        options: { cache: "no-store" },
      }).unwrap(),
    retry: false,
  });
  // Server-authoritative: the API re-checks cap.alert.publish_emergency on the
  // call itself. This query only decides whether to show the action.
  const accessQuery = useQuery({
    queryKey: ["cap", "authoring", "access"],
    queryFn: () => authGetEffectiveAccess().unwrap(),
    retry: false,
  });
  const canEmergencyPublish =
    accessQuery.data?.is_superuser === true ||
    accessQuery.data?.permission_keys.includes(
      "cap.alert.publish_emergency"
    ) === true;
  // The API also refuses a review from the alert's author.
  const canReview =
    accessQuery.data?.is_superuser === true ||
    accessQuery.data?.permission_keys.includes("cap.alert.approve") === true;
  const [pending, setPending] = useState<Pending>(IDLE);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [validation, setValidation] = useState<{
    version: string;
    result: CapValidationResult;
  } | null>(null);
  const busy = pending.status === "busy";
  const dialogOpen = (dialog: ConfirmDialog) =>
    pending.status === "confirm" && pending.dialog === dialog;
  // Closing a dialog only clears it while that dialog is the one open, so a
  // confirm button's own close cannot overwrite the busy state it just set.
  const setDialogOpen = (dialog: ConfirmDialog, open: boolean) => {
    if (open) {
      setPending({ status: "confirm", dialog });
      return;
    }
    setPending((prev) =>
      prev.status === "confirm" && prev.dialog === dialog ? IDLE : prev
    );
  };
  const alert = alertQuery.data;
  const version = alert ? JSON.stringify(alert) : "";
  const valid = validation?.version === version && validation.result.is_valid;

  async function run(action: WorkflowAction) {
    if (busy || !alert) return;
    setPending(BUSY);
    setMessage("");
    const path = { alert_id: alertId };
    try {
      if (action === "validate") {
        const result = await capValidateAlert({
          path,
        }).unwrap();
        setValidation({ version, result });
        setReviewed(false);
        return;
      }
      const options = { path, body: { note: note.trim() || null } };
      const updated = await LIFECYCLE_ACTIONS[action](options);
      client.setQueryData(queryKey, updated);
      setValidation(null);
      setReviewed(false);
      setNote("");
      setMessage(
        action === "reviewed" || action === "changes_requested"
          ? "Review recorded in the audit history."
          : `CAP state: ${updated.lifecycle_state}.`
      );
      router.refresh();
    } catch (error) {
      setMessage(errorText(error));
      setValidation(null);
      setReviewed(false);
      await alertQuery.refetch();
    } finally {
      setPending(IDLE);
    }
  }

  if (alertQuery.isPending) return <p role="status">Loading CAP alert…</p>;
  if (alertQuery.isError || !alert)
    return (
      <div className="space-y-4">
        <p role="alert">{errorText(alertQuery.error)}</p>
        <Button onClick={() => alertQuery.refetch()}>Reload alert</Button>
      </div>
    );
  // The review and publish stage, and the withdraw stage, follow what the API offers.
  const inReview = canAny(alert, [
    "submit",
    "approve",
    "publish",
    "emergency_publish",
  ]);
  const withdrawable = canAny(alert, ["cancel", "expire"]);
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link className="underline" href="/cap">
        Back to CAP Composer
      </Link>
      <PageHeader title={alert.info?.[0]?.headline ?? alert.identifier} />
      <Link
        className="underline"
        href={`/cap/audit?alert_id=${encodeURIComponent(alertId)}`}
      >
        View audit history
      </Link>
      <p>
        Workflow state: <strong>{alert.lifecycle_state}</strong>
      </p>
      <SavedAlert alert={alert} />
      {message ? (
        <p className="whitespace-pre-wrap" role="status">
          {message}
        </p>
      ) : null}
      {inReview ? (
        <ReviewAndPublishSection
          alert={alert}
          busy={busy || alertQuery.isFetching}
          canEmergencyPublish={canEmergencyPublish}
          canReview={canReview}
          emergencyOpen={dialogOpen("emergency")}
          note={note}
          onEmergencyOpenChange={(open) => setDialogOpen("emergency", open)}
          onNoteChange={setNote}
          onReviewedChange={setReviewed}
          reviewed={reviewed}
          run={run}
          valid={valid}
          validation={validation}
          version={version}
        />
      ) : null}
      {withdrawable ? (
        <WithdrawSection
          alert={alert}
          busy={busy || alertQuery.isFetching}
          cancelOpen={dialogOpen("cancel")}
          expireOpen={dialogOpen("expire")}
          note={note}
          onCancelOpenChange={(open) => setDialogOpen("cancel", open)}
          onExpireOpenChange={(open) => setDialogOpen("expire", open)}
          onNoteChange={setNote}
          run={run}
        />
      ) : null}
    </div>
  );
}

const PUBLISH_STATUS_TEXT: Record<string, string> = {
  DRAFT:
    "Draft: request review. Publishing needs an approval, which you may give yourself.",
  SUBMITTED:
    "Awaiting approval. You may approve it yourself; a colleague can review it first.",
  APPROVED:
    "Approved: publishing will issue this alert to the configured distribution channels.",
};

function ReviewAndPublishSection({
  alert,
  busy,
  canEmergencyPublish,
  canReview,
  emergencyOpen,
  onEmergencyOpenChange,
  note,
  onNoteChange,
  onReviewedChange,
  reviewed,
  run,
  valid,
  validation,
  version,
}: {
  alert: CapAlertPublic;
  busy: boolean;
  canEmergencyPublish: boolean;
  canReview: boolean;
  emergencyOpen: boolean;
  onEmergencyOpenChange: (open: boolean) => void;
  note: string;
  onNoteChange: (note: string) => void;
  onReviewedChange: (reviewed: boolean) => void;
  reviewed: boolean;
  run: (action: WorkflowAction) => void;
  valid: boolean | undefined;
  validation: { version: string; result: CapValidationResult } | null;
  version: string;
}) {
  const emergencyOffered =
    canEmergencyPublish && can(alert, "emergency_publish");
  return (
    <fieldset className="space-y-4 rounded-xl border p-4" disabled={busy}>
      <legend className="font-semibold">Review and publication</legend>
      <p className="text-muted-foreground text-sm">
        Validate the saved alert, then review its content, status, scope, areas
        and validity. The alert needs an approval before it can be published;
        the author may give it. A colleague can review it first (optional); a
        review or a change request is recorded but does not stop publication.
      </p>
      <Button onClick={() => run("validate")} type="button" variant="outline">
        Validate alert
      </Button>
      {validation?.version === version ? (
        <div role="status">
          <p>
            {validation.result.is_valid
              ? "Validation passed."
              : "Validation failed."}
          </p>
          {[...new Set(validation.result.errors ?? [])].map((text) => (
            <p key={`error-${text}`}>Error: {text}</p>
          ))}
          {[...new Set(validation.result.warnings ?? [])].map((text) => (
            <p key={`warning-${text}`}>Warning: {text}</p>
          ))}
        </div>
      ) : null}
      <Label htmlFor="cap-action-note">Workflow note</Label>
      <Textarea
        id="cap-action-note"
        maxLength={2000}
        onChange={(event) => onNoteChange(event.target.value)}
        value={note}
      />
      <label className="flex items-start gap-2 text-sm">
        <input
          checked={reviewed && Boolean(valid)}
          disabled={!valid}
          onChange={(event) => onReviewedChange(event.target.checked)}
          type="checkbox"
        />
        I have reviewed this saved alert and its validation results.
      </label>
      <div className="flex flex-wrap gap-2">
        {can(alert, "submit") ? (
          <Button
            disabled={!(valid && reviewed)}
            onClick={() => run("submit")}
            type="button"
            variant="outline"
          >
            Request review
          </Button>
        ) : null}
        {can(alert, "approve") ? (
          <Button
            disabled={!(valid && reviewed)}
            onClick={() => run("approve")}
            type="button"
            variant="outline"
          >
            Record approval
          </Button>
        ) : null}
        {canReview && (can(alert, "approve") || can(alert, "publish")) ? (
          <>
            <Button
              onClick={() => run("reviewed")}
              type="button"
              variant="ghost"
            >
              Mark reviewed
            </Button>
            <Button
              disabled={!note.trim()}
              onClick={() => run("changes_requested")}
              type="button"
              variant="ghost"
            >
              Request changes
            </Button>
          </>
        ) : null}
        <Button
          disabled={!(valid && reviewed && can(alert, "publish"))}
          onClick={() => run("publish")}
          type="button"
        >
          Publish CAP alert
        </Button>
        {emergencyOffered ? (
          <Button
            disabled={!(valid && reviewed && note.trim())}
            onClick={() => onEmergencyOpenChange(true)}
            type="button"
            variant="destructive"
          >
            Emergency publish
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">
        {PUBLISH_STATUS_TEXT[alert.lifecycle_state] ??
          "This alert cannot be published from its current state."}
      </p>
      {emergencyOffered ? (
        <p className="text-muted-foreground text-sm">
          Emergency publish skips approval. Enter the reason in the workflow
          note; it is recorded in the audit history.
        </p>
      ) : null}
      <AlertDialog onOpenChange={onEmergencyOpenChange} open={emergencyOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>
            Emergency publish without approval?
          </AlertDialogTitle>
          <AlertDialogDescription>
            This issues the alert to the public without any approval. Your
            reason is recorded in the audit history.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Do not publish</AlertDialogCancel>
            <AlertDialogAction onClick={() => run("emergency")}>
              Confirm emergency publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fieldset>
  );
}

function WithdrawSection({
  alert,
  busy,
  cancelOpen,
  expireOpen,
  note,
  onCancelOpenChange,
  onExpireOpenChange,
  onNoteChange,
  run,
}: {
  alert: CapAlertPublic;
  busy: boolean;
  cancelOpen: boolean;
  expireOpen: boolean;
  note: string;
  onCancelOpenChange: (open: boolean) => void;
  onExpireOpenChange: (open: boolean) => void;
  onNoteChange: (note: string) => void;
  run: (action: WorkflowAction) => void;
}) {
  return (
    <fieldset className="space-y-4 rounded-xl border p-4" disabled={busy}>
      <legend className="font-semibold">Withdraw this alert</legend>
      <Label htmlFor="cap-action-note">Cancellation reason</Label>
      <Textarea
        id="cap-action-note"
        maxLength={2000}
        onChange={(event) => onNoteChange(event.target.value)}
        required
        value={note}
      />
      <div className="flex flex-wrap gap-2">
        {can(alert, "cancel") ? (
          <Button
            disabled={!note.trim()}
            onClick={() => onCancelOpenChange(true)}
            type="button"
          >
            Cancel alert
          </Button>
        ) : null}
        {can(alert, "expire") ? (
          <Button
            onClick={() => onExpireOpenChange(true)}
            type="button"
            variant="outline"
          >
            Mark expired
          </Button>
        ) : null}
      </div>
      <p className="text-muted-foreground text-sm">
        Cancel issues a public CAP Cancel message retracting this alert. Mark
        expired simply lets it lapse without a new public message.
      </p>
      <AlertDialog onOpenChange={onCancelOpenChange} open={cancelOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Cancel this CAP alert?</AlertDialogTitle>
          <AlertDialogDescription>
            This issues a public CAP Cancel message retracting the published
            alert. This cannot be undone.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it published</AlertDialogCancel>
            <AlertDialogAction onClick={() => run("cancel")}>
              Confirm cancellation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog onOpenChange={onExpireOpenChange} open={expireOpen}>
        <AlertDialogContent>
          <AlertDialogTitle>Mark this CAP alert expired?</AlertDialogTitle>
          <AlertDialogDescription>
            The alert leaves the public active feed at once. It lapses without a
            new public CAP message, so nothing is sent to the public when you
            confirm.
          </AlertDialogDescription>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it published</AlertDialogCancel>
            <AlertDialogAction onClick={() => run("expire")}>
              Confirm: mark expired
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </fieldset>
  );
}

function SavedAlert({ alert }: { alert: CapAlertPublic }) {
  return (
    <>
      <dl className="grid gap-2 text-sm">
        <div>
          <dt className="font-semibold">Identifier</dt>
          <dd>{alert.identifier}</dd>
        </div>
        <div>
          <dt className="font-semibold">Sender / issued</dt>
          <dd>
            {alert.sender} / {alert.sent}
          </dd>
        </div>
        <div>
          <dt className="font-semibold">Status / message type / scope</dt>
          <dd>
            {alert.status} / {alert.msg_type} / {alert.scope}
          </dd>
        </div>
      </dl>
      {(alert.info ?? []).map((info) => {
        const source = readSourceBulletinLink(info.parameters);
        return (
          <section
            className="bg-card space-y-3 rounded-xl border p-4"
            key={info.id}
          >
            <h2 className="font-semibold">
              {info.headline} ({info.language})
            </h2>
            <p>
              {info.event} · {info.severity} · {info.urgency} · {info.certainty}
            </p>
            <p>
              Effective: {info.effective ?? "Not specified"} · Onset:{" "}
              {info.onset ?? "Not specified"} · Expires:{" "}
              {info.expires ?? "Not specified"}
            </p>
            <p>
              Areas:{" "}
              {(info.areas ?? []).map((area) => area.area_desc).join(", ") ||
                "None specified"}
            </p>
            <p className="whitespace-pre-wrap">{info.description}</p>
            {source ? (
              <p>
                <strong>Source bulletin: </strong>
                {source.kind} · revision {source.revision} · {source.id}
              </p>
            ) : null}
            {info.instruction ? (
              <p className="whitespace-pre-wrap">
                <strong>Instructions: </strong>
                {info.instruction}
              </p>
            ) : null}
          </section>
        );
      })}
      <details>
        <summary className="cursor-pointer">Full saved CAP record</summary>
        <pre className="overflow-auto text-xs whitespace-pre-wrap">
          {JSON.stringify(alert, null, 2)}
        </pre>
      </details>
    </>
  );
}
