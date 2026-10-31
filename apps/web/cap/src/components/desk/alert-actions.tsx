"use client";

import {
  type CapAlertPublic,
  type CapValidationResult,
  capApproveAlert,
  capCancelAlert,
  capEmergencyPublishAlert,
  capExpireAlert,
  capIssueAlertUpdate,
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
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { DeskErrorNotice } from "@/components/desk/error-notice";
import { type DeskError, describeDeskError } from "@/lib/desk/errors";
import type { DeskPermissions } from "@/lib/desk/permissions";

type Action =
  | "approve"
  | "cancel"
  | "changes_requested"
  | "emergency"
  | "expire"
  | "publish"
  | "reviewed"
  | "submit"
  | "update";

type Dialog = "cancel" | "emergency" | "expire" | "publish" | null;

const DRAFT_LIKE = new Set(["DRAFT", "SUBMITTED", "APPROVED"]);

const STATE_TEXT: Record<string, string> = {
  DRAFT:
    "Draft. Validate it, then request review. Publishing needs an approval, which you may give yourself.",
  SUBMITTED:
    "Awaiting approval. You may approve it yourself; a colleague can review it first.",
  APPROVED:
    "Approved. Publishing issues this alert to the public and every distribution channel.",
};

export interface AlertActionsProps {
  alert: CapAlertPublic;
  permissions: DeskPermissions;
  userId: string;
}

/**
 * Every lifecycle action on one saved alert. FastAPI decides each transition
 * and permission; this only offers the next sensible step, asks for the reason
 * or confirmation the API requires, and shows the answer. After a change the
 * page reloads the alert from the server.
 */
export function AlertActions({
  alert,
  permissions,
  userId,
}: AlertActionsProps) {
  const router = useRouter();
  const id = useId();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [dialog, setDialog] = useState<Dialog>(null);
  const [error, setError] = useState<DeskError | null>(null);
  const [message, setMessage] = useState("");
  const [formatProblem, setFormatProblem] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [validation, setValidation] = useState<{
    result: CapValidationResult;
    version: string;
  } | null>(null);

  const version = `${alert.id}:${alert.updated_at}:${alert.lifecycle_state}`;
  const valid =
    validation?.version === version && validation.result.is_valid === true;
  const ready = valid && checked;
  const imported = Boolean(alert.import_source);
  const importOk = !imported || importConfirmed;
  const isAuthor = alert.created_by_user_id === userId;
  const reason = note.trim();

  async function validate() {
    setBusy(true);
    setError(null);
    try {
      const result = await capValidateAlert({
        path: { alert_id: alert.id },
      }).unwrap();
      setValidation({ result, version });
      setChecked(false);
    } catch (caught) {
      setError(describeDeskError(caught));
    } finally {
      setBusy(false);
    }
  }

  async function run(action: Action) {
    if (busy) return;
    setBusy(true);
    setError(null);
    setMessage("");
    setDialog(null);
    const path = { alert_id: alert.id };
    const body = { note: reason || null };
    try {
      if (action === "update") {
        const draft = await capIssueAlertUpdate({ path }).unwrap();
        router.push(`/desk/alerts/${draft.id}/edit` as Route);
        return;
      }
      if (action === "emergency" || action === "publish") {
        const published =
          action === "emergency"
            ? await capEmergencyPublishAlert({
                path,
                body: { confirm_imported: importConfirmed, reason },
              }).unwrap()
            : await capPublishAlert({
                path,
                body: { ...body, confirm_imported: importConfirmed },
              }).unwrap();
        setFormatProblem(published.snapshot.schema_mismatch ?? null);
        setMessage(
          action === "emergency"
            ? "Published without approval. The reason is in the audit history."
            : "Published."
        );
      } else if (action === "reviewed" || action === "changes_requested") {
        await capRecordAlertReview({
          path,
          body: { note: body.note, outcome: action },
        }).unwrap();
        setMessage("Review recorded in the audit history.");
      } else {
        const call = {
          approve: capApproveAlert,
          cancel: capCancelAlert,
          expire: capExpireAlert,
          submit: capSubmitAlert,
        }[action];
        await call({ path, body }).unwrap();
        setMessage(
          {
            approve: "Approved.",
            cancel:
              "Cancelled. A public CAP Cancel message was issued for this alert.",
            expire: "Marked expired. No public message was sent.",
            submit: "Review requested.",
          }[action]
        );
      }
      setNote("");
      setChecked(false);
      setValidation(null);
      router.refresh();
    } catch (caught) {
      setError(describeDeskError(caught));
      setValidation(null);
      setChecked(false);
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  const draftLike = DRAFT_LIKE.has(alert.lifecycle_state);
  const published = alert.lifecycle_state === "PUBLISHED";
  const updatable =
    published &&
    (alert.msg_type === "Alert" || alert.msg_type === "Update") &&
    !imported &&
    alert.schema_conformant &&
    permissions.create;

  return (
    <div className="space-y-4">
      {formatProblem ? (
        <div
          className="space-y-1 rounded-lg border-2 border-destructive bg-destructive/10 p-4"
          role="alert"
        >
          <p className="font-semibold text-destructive">
            Published with a CAP format problem
          </p>
          <p className="text-body-sm">
            The warning went out, but its CAP XML does not follow the official
            CAP 1.2 schema: {formatProblem}
          </p>
          <p className="text-body-sm">
            The duty supervisor has been notified. Partners that check the
            schema may reject this message; issue an Update once it is fixed.
          </p>
        </div>
      ) : null}
      {message ? (
        <p
          className="rounded-lg border bg-muted p-3 text-body-sm"
          role="status"
        >
          {message}
        </p>
      ) : null}
      <DeskErrorNotice error={error} />

      {imported && (draftLike || published) ? (
        <div
          className="space-y-2 rounded-lg border border-warning bg-warning-soft p-4 text-warning-soft-foreground"
          role="note"
        >
          <p className="font-semibold">
            Imported from another sender ({alert.import_source})
          </p>
          {alert.schema_conformant ? null : (
            <p className="text-body-sm">
              It does not fully follow the CAP 1.2 schema:{" "}
              {alert.schema_error ?? "no details recorded"}.
            </p>
          )}
          {draftLike ? (
            <label className="flex items-start gap-2 text-body-sm">
              <input
                checked={importConfirmed}
                onChange={(event) => setImportConfirmed(event.target.checked)}
                type="checkbox"
              />
              I have checked this imported alert against its source and it is
              right to publish it as ours.
            </label>
          ) : null}
        </div>
      ) : null}

      {draftLike ? (
        <fieldset className="space-y-4 rounded-lg border p-4" disabled={busy}>
          <legend className="px-1 font-semibold">Review and publish</legend>
          <p className="text-body-sm text-muted-foreground">
            {STATE_TEXT[alert.lifecycle_state]}
          </p>
          <div className="flex flex-wrap gap-2">
            {permissions.edit ? (
              <Button asChild variant="outline">
                <Link href={`/desk/alerts/${alert.id}/edit` as Route}>
                  Edit draft
                </Link>
              </Button>
            ) : null}
            <Button onClick={validate} type="button" variant="outline">
              Validate
            </Button>
          </div>
          {validation?.version === version ? (
            <div className="space-y-1 text-body-sm" role="status">
              <p className="font-semibold">
                {validation.result.is_valid
                  ? "Validation passed."
                  : "Validation failed."}
              </p>
              <ul className="list-disc pl-5">
                {[...new Set(validation.result.errors ?? [])].map((text) => (
                  <li className="text-destructive" key={`e-${text}`}>
                    Error: {text}
                  </li>
                ))}
                {[...new Set(validation.result.warnings ?? [])].map((text) => (
                  <li key={`w-${text}`}>Warning: {text}</li>
                ))}
              </ul>
            </div>
          ) : null}
          <label className="flex items-start gap-2 text-body-sm">
            <input
              checked={ready}
              disabled={!valid}
              onChange={(event) => setChecked(event.target.checked)}
              type="checkbox"
            />
            I have reviewed this saved alert and its validation results.
          </label>
          <div className="space-y-2">
            <Label htmlFor={`${id}-note`}>
              Note (needed for a change request or emergency publish)
            </Label>
            <Textarea
              id={`${id}-note`}
              maxLength={2000}
              onChange={(event) => setNote(event.target.value)}
              value={note}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {alert.lifecycle_state === "DRAFT" && permissions.submit ? (
              <Button
                disabled={!ready}
                onClick={() => run("submit")}
                type="button"
                variant="outline"
              >
                Request review
              </Button>
            ) : null}
            {alert.lifecycle_state === "SUBMITTED" && permissions.approve ? (
              <Button
                disabled={!ready}
                onClick={() => run("approve")}
                type="button"
                variant="outline"
              >
                Approve
              </Button>
            ) : null}
            {permissions.approve &&
            !isAuthor &&
            alert.lifecycle_state !== "DRAFT" ? (
              <>
                <Button
                  onClick={() => run("reviewed")}
                  type="button"
                  variant="ghost"
                >
                  Mark reviewed
                </Button>
                <Button
                  disabled={!reason}
                  onClick={() => run("changes_requested")}
                  type="button"
                  variant="ghost"
                >
                  Request changes
                </Button>
              </>
            ) : null}
            {permissions.publish ? (
              <Button
                disabled={
                  !(ready && importOk && alert.lifecycle_state === "APPROVED")
                }
                onClick={() => setDialog("publish")}
                type="button"
              >
                Publish
              </Button>
            ) : null}
            {permissions.emergencyPublish ? (
              <Button
                disabled={!(ready && importOk && reason)}
                onClick={() => setDialog("emergency")}
                type="button"
                variant="destructive"
              >
                Emergency publish
              </Button>
            ) : null}
          </div>
          {permissions.emergencyPublish ? (
            <p className="text-body-sm text-muted-foreground">
              Emergency publish skips approval. Write the reason in the note; it
              is recorded in the audit history and the duty supervisor sees it.
            </p>
          ) : null}
        </fieldset>
      ) : null}

      {published ? (
        <fieldset className="space-y-4 rounded-lg border p-4" disabled={busy}>
          <legend className="px-1 font-semibold">Change or withdraw</legend>
          {updatable ? (
            <div className="space-y-2">
              <Button
                onClick={() => run("update")}
                type="button"
                variant="outline"
              >
                Issue update
              </Button>
              <p className="text-body-sm text-muted-foreground">
                Starts a draft Update with this alert's content. Change what is
                needed (colour, areas, expiry), then approve and publish it; it
                replaces this alert. If an Update is already being prepared, you
                are taken to it.
              </p>
            </div>
          ) : null}
          {permissions.publish ? (
            <>
              <div className="space-y-2">
                <Label htmlFor={`${id}-reason`}>Cancellation reason</Label>
                <Textarea
                  id={`${id}-reason`}
                  maxLength={2000}
                  onChange={(event) => setNote(event.target.value)}
                  value={note}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  disabled={!reason}
                  onClick={() => setDialog("cancel")}
                  type="button"
                  variant="destructive"
                >
                  Cancel alert
                </Button>
                <Button
                  onClick={() => setDialog("expire")}
                  type="button"
                  variant="outline"
                >
                  Mark expired
                </Button>
              </div>
              <p className="text-body-sm text-muted-foreground">
                Cancel issues a public CAP Cancel message retracting this alert.
                Mark expired lets it lapse without any new public message.
              </p>
            </>
          ) : null}
        </fieldset>
      ) : null}

      <Confirm
        action="Publish now"
        description="This issues the alert to the public and every distribution channel."
        onConfirm={() => run("publish")}
        onOpenChange={(open) => setDialog(open ? "publish" : null)}
        open={dialog === "publish"}
        title="Publish this alert?"
      />
      <Confirm
        action="Confirm emergency publish"
        description="This issues the alert to the public without any approval. Your reason is recorded in the audit history."
        onConfirm={() => run("emergency")}
        onOpenChange={(open) => setDialog(open ? "emergency" : null)}
        open={dialog === "emergency"}
        title="Emergency publish without approval?"
      />
      <Confirm
        action="Confirm cancellation"
        description="This issues a public CAP Cancel message retracting the published alert. It cannot be undone."
        onConfirm={() => run("cancel")}
        onOpenChange={(open) => setDialog(open ? "cancel" : null)}
        open={dialog === "cancel"}
        title="Cancel this alert?"
      />
      <Confirm
        action="Confirm: mark expired"
        description="The alert leaves the public active list at once. No public CAP message is sent."
        onConfirm={() => run("expire")}
        onOpenChange={(open) => setDialog(open ? "expire" : null)}
        open={dialog === "expire"}
        title="Mark this alert expired?"
      />
    </div>
  );
}

function Confirm({
  action,
  description,
  onConfirm,
  onOpenChange,
  open,
  title,
}: {
  action: string;
  description: string;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  title: string;
}) {
  return (
    <AlertDialog onOpenChange={onOpenChange} open={open}>
      <AlertDialogContent>
        <AlertDialogTitle>{title}</AlertDialogTitle>
        <AlertDialogDescription>{description}</AlertDialogDescription>
        <AlertDialogFooter>
          <AlertDialogCancel>Go back</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm}>{action}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
