"use client";

import {
  approveAlertApiV1CapAlertsAlertIdApprovePost,
  type CapAlertPublic,
  type CapValidationResult,
  publishAlertApiV1CapAlertsAlertIdPublishPost,
  readAlertApiV1CapAlertsAlertIdGet,
  submitAlertApiV1CapAlertsAlertIdSubmitPost,
  validateAlertApiV1CapAlertsAlertIdValidatePost,
} from "@barrelsgd/api-client";
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

export function AlertWorkflow({ alertId }: { alertId: string }) {
  const router = useRouter();
  const client = useQueryClient();
  const queryKey = ["cap", "authoring", alertId];
  const alertQuery = useQuery({
    queryKey,
    queryFn: () =>
      readAlertApiV1CapAlertsAlertIdGet({
        path: { alert_id: alertId },
        options: { cache: "no-store" },
      }).unwrap(),
    retry: false,
  });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [validation, setValidation] = useState<{
    version: string;
    result: CapValidationResult;
  } | null>(null);
  const alert = alertQuery.data;
  const version = alert ? JSON.stringify(alert) : "";
  const valid = validation?.version === version && validation.result.is_valid;

  async function run(action: "validate" | "submit" | "approve" | "publish") {
    if (busy || !alert) return;
    setBusy(true);
    setMessage("");
    const path = { alert_id: alertId };
    try {
      if (action === "validate") {
        const result = await validateAlertApiV1CapAlertsAlertIdValidatePost({
          path,
        }).unwrap();
        setValidation({ version, result });
        setReviewed(false);
        return;
      }
      const options = { path, body: { note: note.trim() || null } };
      let updated: CapAlertPublic;
      if (action === "submit")
        updated =
          await submitAlertApiV1CapAlertsAlertIdSubmitPost(options).unwrap();
      else if (action === "approve")
        updated =
          await approveAlertApiV1CapAlertsAlertIdApprovePost(options).unwrap();
      else
        updated = (
          await publishAlertApiV1CapAlertsAlertIdPublishPost(options).unwrap()
        ).alert;
      client.setQueryData(queryKey, updated);
      setValidation(null);
      setReviewed(false);
      setNote("");
      setMessage(`CAP state: ${updated.lifecycle_state}.`);
      router.refresh();
    } catch (error) {
      setMessage(errorText(error));
      setValidation(null);
      setReviewed(false);
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
  const actionable = ["DRAFT", "SUBMITTED", "APPROVED"].includes(
    alert.lifecycle_state
  );
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
      {actionable ? (
        <fieldset
          className="space-y-4 rounded-xl border p-4"
          disabled={busy || alertQuery.isFetching}
        >
          <legend className="font-semibold">Review and publication</legend>
          <p className="text-muted-foreground text-sm">
            Validate the saved bulletin, then review its content, status, scope,
            areas and validity. FastAPI checks your permissions and approval
            policy. Approval may require another authorised person.
          </p>
          <Button
            onClick={() => run("validate")}
            type="button"
            variant="outline"
          >
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
            onChange={(event) => setNote(event.target.value)}
            value={note}
          />
          <label className="flex items-start gap-2 text-sm">
            <input
              checked={reviewed && Boolean(valid)}
              disabled={!valid}
              onChange={(event) => setReviewed(event.target.checked)}
              type="checkbox"
            />
            I have reviewed this saved bulletin and its validation results.
          </label>
          {alert.lifecycle_state === "DRAFT" ? (
            <Button
              disabled={!(valid && reviewed)}
              onClick={() => run("submit")}
              type="button"
            >
              Submit for approval
            </Button>
          ) : null}
          {alert.lifecycle_state === "SUBMITTED" ? (
            <Button
              disabled={!(valid && reviewed)}
              onClick={() => run("approve")}
              type="button"
            >
              Approve alert
            </Button>
          ) : null}
          {alert.lifecycle_state === "APPROVED" ? (
            <div className="space-y-2">
              <p className="text-sm">
                Publish will issue this {alert.status} bulletin to the
                configured distribution channels.
              </p>
              <Button
                disabled={!(valid && reviewed)}
                onClick={() => run("publish")}
                type="button"
              >
                Publish CAP bulletin
              </Button>
            </div>
          ) : null}
        </fieldset>
      ) : null}
    </div>
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
