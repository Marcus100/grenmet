"use client";

import { Button } from "@barrelsgd/ui/components/ui/button";
import { unstable_rethrow as rethrow } from "next/navigation";
import { useActionState, useEffect, useRef } from "react";
import type { ModerationFormState } from "@/app/(console)/moderation/actions";
import {
  MAX_REASON,
  MIN_REASON,
  MODERATION_NOTICES,
} from "@/lib/moderation-form";

type DecisionAction = (
  previous: ModerationFormState,
  formData: FormData
) => Promise<ModerationFormState>;

const FIELD = "min-h-11 rounded-md border bg-background px-2.5 py-2";
const NO_STATE: ModerationFormState = {};

/**
 * A server action can throw (network, 5xx). Show reload guidance instead of
 * losing the form; redirects and not-found signals must still pass through.
 */
function guarded(action: DecisionAction): DecisionAction {
  return async (previous, formData) => {
    try {
      return await action(previous, formData);
    } catch (error) {
      rethrow(error);
      return { code: "failed" };
    }
  };
}

function Problem({ code }: { code: ModerationFormState["code"] }) {
  const ref = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (code) ref.current?.focus();
  }, [code]);
  if (!code) return null;
  return (
    <p
      className="rounded-md border border-destructive px-3 py-2 text-sm outline-none"
      ref={ref}
      role="alert"
      tabIndex={-1}
    >
      Problem: {MODERATION_NOTICES[code].text}
    </p>
  );
}

export function ApproveForm({
  action,
  organisationId,
}: {
  action: DecisionAction;
  organisationId: string;
}) {
  const [state, run, pending] = useActionState(guarded(action), NO_STATE);
  return (
    <details className="rounded-md border p-3" open={Boolean(state.code)}>
      <summary className="flex min-h-11 cursor-pointer items-center font-medium">
        Approve this organiser
      </summary>
      <form action={run} className="mt-2 grid max-w-md gap-3">
        <input name="organisation_id" type="hidden" value={organisationId} />
        <p className="text-muted-foreground text-sm">
          Approval verifies the organisation, so its organiser can publish
          listings. It is recorded in the history under your name.
        </p>
        <label className="grid gap-1 text-sm">
          Note (optional, kept in the history)
          <input
            className={FIELD}
            defaultValue={state.reason ?? ""}
            maxLength={MAX_REASON}
            name="reason"
          />
        </label>
        <Problem code={state.code} />
        <Button className="min-h-11" disabled={pending} type="submit">
          {pending ? "Approving..." : "Confirm approval"}
        </Button>
      </form>
    </details>
  );
}

export function RejectForm({
  action,
  organisationId,
}: {
  action: DecisionAction;
  organisationId: string;
}) {
  const [state, run, pending] = useActionState(guarded(action), NO_STATE);
  const counter = useRef<HTMLSpanElement>(null);
  const initial = state.reason?.length ?? 0;
  return (
    <details className="rounded-md border p-3" open={Boolean(state.code)}>
      <summary className="flex min-h-11 cursor-pointer items-center font-medium">
        Reject this organiser
      </summary>
      <form action={run} className="mt-2 grid max-w-md gap-3">
        <input name="organisation_id" type="hidden" value={organisationId} />
        <p className="text-muted-foreground text-sm">
          Rejection keeps the organiser unverified and emails the organiser's
          owners the reason below. They can fix things and resubmit.
        </p>
        <label className="grid gap-1 text-sm">
          Reason sent to the owners (required)
          <textarea
            aria-describedby="reject-count"
            className={FIELD}
            defaultValue={state.reason ?? ""}
            maxLength={MAX_REASON}
            minLength={MIN_REASON}
            name="reason"
            onChange={(event) => {
              if (counter.current) {
                counter.current.textContent = String(event.target.value.length);
              }
            }}
            required
            rows={4}
          />
        </label>
        <p className="text-muted-foreground text-xs" id="reject-count">
          <span ref={counter}>{initial}</span> of {MAX_REASON} characters (at
          least {MIN_REASON}).
        </p>
        <Problem code={state.code} />
        <Button
          className="min-h-11"
          disabled={pending}
          type="submit"
          variant="destructive"
        >
          {pending ? "Rejecting..." : "Confirm rejection"}
        </Button>
      </form>
    </details>
  );
}
