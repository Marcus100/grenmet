"use client";

import type { RosterRuleWarningsErrorPublic } from "@barrelsgd/api-client";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogTitle,
} from "@barrelsgd/ui/components/ui/alert-dialog";
import { Button } from "@barrelsgd/ui/components/ui/button";
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@barrelsgd/ui/components/ui/field";
import { Textarea } from "@barrelsgd/ui/components/ui/textarea";
import { TriangleAlert } from "lucide-react";
import { useState } from "react";
import { ruleTitle, violationDates } from "./rule-codes";

const MIN_REASON = 3;

const ACTION_LABEL: Record<string, string> = {
  PUBLISH: "Publish anyway",
  ROSTER_CHANGE: "Save anyway",
  SHIFT_SWAP: "Approve anyway",
  LEAVE: "Continue anyway",
  ABSENCE: "Continue anyway",
  TIMESHEET: "Approve anyway",
  ATTENDANCE: "Approve anyway",
};

interface RuleOverrideDialogProps {
  busy?: boolean;
  /** Display names keyed by user id; unknown ids show "Staff member". */
  labels?: ReadonlyMap<string, string>;
  onCancel: () => void;
  /** Resend the change with this reason. */
  onConfirm: (reason: string) => void;
  /** The 409 body; the dialog is open while this is set. */
  warnings: RosterRuleWarningsErrorPublic | null;
}

/**
 * Lists roster rule breaches and lets a supervisor save anyway with a required
 * reason. The reason, the rules and who saved it are recorded by the API.
 */
export function RuleOverrideDialog({
  warnings,
  labels,
  busy = false,
  onCancel,
  onConfirm,
}: RuleOverrideDialogProps) {
  const [reason, setReason] = useState("");
  const [problem, setProblem] = useState<string>();
  const violations = warnings?.violations ?? [];

  function close() {
    setReason("");
    setProblem(undefined);
    onCancel();
  }

  function confirm() {
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON) {
      setProblem("Give a reason of at least 3 characters.");
      return;
    }
    onConfirm(trimmed);
    setReason("");
    setProblem(undefined);
  }

  return (
    <AlertDialog
      onOpenChange={(open) => {
        if (!open) close();
      }}
      open={Boolean(warnings)}
    >
      <AlertDialogContent>
        <AlertDialogTitle className="flex items-center gap-2">
          <TriangleAlert className="size-4 text-gm-risk-amber" />
          {violations.length} roster rule{" "}
          {violations.length === 1 ? "warning" : "warnings"}
        </AlertDialogTitle>
        <AlertDialogDescription>
          This change breaks the roster rules below. You can still save it, but
          you must give a reason. Your name, the time, the rules and the reason
          are recorded.
        </AlertDialogDescription>
        <ul
          aria-label="Rule warnings"
          className="max-h-56 space-y-1 overflow-y-auto rounded-lg border border-gm-risk-amber/40 bg-gm-risk-amber/10 px-3 py-2 text-xs"
        >
          {violations.map((v) => (
            <li key={`${v.code}-${v.user_id}-${v.start_date}-${v.end_date}`}>
              <span className="font-medium">
                {labels?.get(v.user_id) ?? "Staff member"}
              </span>{" "}
              · {ruleTitle(v.code)} · {violationDates(v)} ·{" "}
              <span className="text-muted-foreground">{v.detail}</span>
            </li>
          ))}
        </ul>
        <Field data-invalid={problem ? true : undefined}>
          <FieldLabel htmlFor="rule-override-reason">
            Reason for saving anyway
          </FieldLabel>
          <Textarea
            aria-invalid={problem ? true : undefined}
            autoFocus
            id="rule-override-reason"
            maxLength={1000}
            onChange={(event) => {
              setReason(event.target.value);
              setProblem(undefined);
            }}
            value={reason}
          />
          <FieldDescription>
            For example: covering for a colleague on sick leave.
          </FieldDescription>
          {problem ? (
            <p className="text-destructive text-sm" role="alert">
              {problem}
            </p>
          ) : null}
        </Field>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <Button disabled={busy} onClick={confirm} type="button">
            {ACTION_LABEL[warnings?.context ?? ""] ?? "Save anyway"}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
