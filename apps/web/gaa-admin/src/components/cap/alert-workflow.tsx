"use client";

import {
  type CapAlertPublic,
  type CapValidationResult,
  capApproveAlert,
  capCancelAlert,
  capExpireAlert,
  capGetAlert,
  capPublishAlert,
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

function errorText(error: unknown): string {
  if (error && typeof error === "object" && "data" in error) {
    const data = error.data;
    if (data && typeof data === "object" && "detail" in data) {
      if (typeof data.detail === "string") return data.detail;
      return JSON.stringify(data.detail);
    }
  }
  return error instanceof Error
    ? error.message
    : "The request failed. Reload the alert before trying again.";
}

type WorkflowAction =
  | "validate"
  | "submit"
  | "approve"
  | "publish"
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
  cancel: (options) => capCancelAlert(options).unwrap(),
  expire: (options) => capExpireAlert(options).unwrap(),
  publish: async (options) => (await capPublishAlert(options).unwrap()).alert,
  submit: (options) => capSubmitAlert(options).unwrap(),
};

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
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [validation, setValidation] = useState<{
    version: string;
    result: CapValidationResult;
  } | null>(null);
  const alert = alertQuery.data;
  const version = alert ? JSON.stringify(alert) : "";
  const valid = validation?.version === version && validation.result.is_valid;

  async function run(action: WorkflowAction) {
    if (busy || !alert) return;
    setBusy(true);
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
      setCancelOpen(false);
      setMessage(`CAP state: ${updated.lifecycle_state}.`);
      router.refresh();
    } catch (error) {
      setMessage(errorText(error));
      setValidation(null);
      setReviewed(false);
      setCancelOpen(false);
      await alertQuery.refetch();
    } finally {
      setBusy(false);
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
  const draftLike = ["DRAFT", "SUBMITTED", "APPROVED"].includes(
    alert.lifecycle_state
  );
  const published = alert.lifecycle_state === "PUBLISHED";
  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <Link className="underline" href="/cap">
        Back to CAP Composer
      </Link>
      <h1 className="font-semibold text-2xl">
        {alert.info?.[0]?.headline ?? alert.identifier}
      </h1>
      <p>
        Workflow state: <strong>{alert.lifecycle_state}</strong>
      </p>
      <SavedBulletin alert={alert} />
      {message ? (
        <p className="whitespace-pre-wrap" role="status">
          {message}
        </p>
      ) : null}
      {draftLike ? (
        <ReviewAndPublishSection
          alert={alert}
          busy={busy || alertQuery.isFetching}
          note={note}
          onNoteChange={setNote}
          onReviewedChange={setReviewed}
          reviewed={reviewed}
          run={run}
          valid={valid}
          validation={validation}
          version={version}
        />
      ) : null}
      {published ? (
        <WithdrawSection
          busy={busy || alertQuery.isFetching}
          cancelOpen={cancelOpen}
          note={note}
          onCancelOpenChange={setCancelOpen}
          onNoteChange={setNote}
          run={run}
        />
      ) : null}
    </div>
  );
}

function ReviewAndPublishSection({
  alert,
  busy,
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
  note: string;
  onNoteChange: (note: string) => void;
  onReviewedChange: (reviewed: boolean) => void;
  reviewed: boolean;
  run: (action: WorkflowAction) => void;
  valid: boolean | undefined;
  validation: { version: string; result: CapValidationResult } | null;
  version: string;
}) {
  return (
    <fieldset className="space-y-4 rounded-xl border p-4" disabled={busy}>
      <legend className="font-semibold">Review and publication</legend>
      <p className="text-muted-foreground text-sm">
        Validate the saved bulletin, then review its content, status, scope,
        areas and validity. Requesting review is optional — anyone can look at a
        draft first, but publishing never requires it.
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
        I have reviewed this saved bulletin and its validation results.
      </label>
      <div className="flex flex-wrap gap-2">
        {alert.lifecycle_state === "DRAFT" ? (
          <Button
            disabled={!(valid && reviewed)}
            onClick={() => run("submit")}
            type="button"
            variant="outline"
          >
            Request review
          </Button>
        ) : null}
        {alert.lifecycle_state === "SUBMITTED" ? (
          <Button
            disabled={!(valid && reviewed)}
            onClick={() => run("approve")}
            type="button"
            variant="outline"
          >
            Record approval
          </Button>
        ) : null}
        <Button
          disabled={!(valid && reviewed)}
          onClick={() => run("publish")}
          type="button"
        >
          Publish CAP bulletin
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Publish will issue this {alert.status} bulletin to the configured
        distribution channels, whether or not it went through review first.
      </p>
    </fieldset>
  );
}

function WithdrawSection({
  busy,
  cancelOpen,
  note,
  onCancelOpenChange,
  onNoteChange,
  run,
}: {
  busy: boolean;
  cancelOpen: boolean;
  note: string;
  onCancelOpenChange: (open: boolean) => void;
  onNoteChange: (note: string) => void;
  run: (action: WorkflowAction) => void;
}) {
  return (
    <fieldset className="space-y-4 rounded-xl border p-4" disabled={busy}>
      <legend className="font-semibold">Withdraw this alert</legend>
      <Label htmlFor="cap-action-note">Workflow note</Label>
      <Textarea
        id="cap-action-note"
        maxLength={2000}
        onChange={(event) => onNoteChange(event.target.value)}
        value={note}
      />
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => onCancelOpenChange(true)} type="button">
          Cancel alert
        </Button>
        <Button onClick={() => run("expire")} type="button" variant="outline">
          Mark expired
        </Button>
      </div>
      <p className="text-muted-foreground text-sm">
        Cancel issues a public CAP Cancel message retracting this alert. Mark
        expired simply lets it lapse without a new public message.
        {" If this alert escalated a Hazard Bulletin, withdraw that"}
        {" bulletin separately — it has no standing reason to stay public"}
        {" once the hazard it flagged has been called off."}
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
    </fieldset>
  );
}

function SavedBulletin({ alert }: { alert: CapAlertPublic }) {
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
      {(alert.info ?? []).map((info) => (
        <section
          className="space-y-3 rounded-xl border bg-card p-4"
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
          {info.instruction ? (
            <p className="whitespace-pre-wrap">
              <strong>Instructions: </strong>
              {info.instruction}
            </p>
          ) : null}
        </section>
      ))}
      <details>
        <summary className="cursor-pointer">Full saved CAP record</summary>
        <pre className="overflow-auto whitespace-pre-wrap text-xs">
          {JSON.stringify(alert, null, 2)}
        </pre>
      </details>
    </>
  );
}
