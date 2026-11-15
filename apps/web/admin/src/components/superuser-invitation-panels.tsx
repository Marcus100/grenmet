"use client";

import { useActionState, useState } from "react";
import {
  type InviteFormState,
  inviteSuperuserAction,
} from "@/app/(console)/superusers/actions";
import { REASON_MAX, REASON_MIN } from "@/lib/superuser-invitation-form";

const EMPTY: InviteFormState = {
  message: null,
  notice: null,
  resetKey: 0,
  values: { email: "", reason: "" },
};

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";

interface FieldsProps {
  initialEmail: string;
  initialReason: string;
  pending: boolean;
}

/** The fields are remounted (empty) when the action reports success, via the key. */
function InviteFields({ initialEmail, initialReason, pending }: FieldsProps) {
  const [email, setEmail] = useState(initialEmail);
  const [reason, setReason] = useState(initialReason);
  const count = reason.trim().length;

  return (
    <>
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="invite-email">
          Email address
        </label>
        <input
          autoComplete="off"
          className={inputClass}
          id="invite-email"
          maxLength={320}
          name="email"
          onChange={(event) => setEmail(event.target.value)}
          required
          spellCheck={false}
          type="email"
          value={email}
        />
      </div>
      <div className="space-y-1">
        <label className="block text-sm font-medium" htmlFor="invite-reason">
          Reason
        </label>
        <p className="text-muted-foreground text-sm" id="invite-reason-rule">
          {`Say why this person needs superuser access. ${REASON_MIN} to ${REASON_MAX} characters. The reason is kept in the audit log and is not emailed.`}
        </p>
        <textarea
          aria-describedby="invite-reason-rule invite-reason-count"
          className={inputClass}
          id="invite-reason"
          maxLength={REASON_MAX}
          name="reason"
          onChange={(event) => setReason(event.target.value)}
          required
          rows={3}
          value={reason}
        />
        <p className="text-muted-foreground text-xs" id="invite-reason-count">
          {`${count} of ${REASON_MAX} characters`}
        </p>
      </div>
      <button
        className="bg-foreground text-background rounded-md px-4 py-2 text-sm font-medium disabled:opacity-60"
        disabled={pending}
        type="submit"
      >
        {pending ? "Sending…" : "Send invitation"}
      </button>
    </>
  );
}

/** Email and reason for a new superuser. The reason is audited, never mailed. */
export function InviteSuperuserForm() {
  const [state, action, pending] = useActionState(inviteSuperuserAction, EMPTY);
  return (
    <div className="max-w-xl space-y-4">
      {state.notice ? (
        <p className="text-sm" role="status">
          {state.notice}
        </p>
      ) : null}
      <form action={action} className="space-y-4">
        {state.message ? (
          <p className="text-destructive text-sm" role="alert">
            {state.message}
          </p>
        ) : null}
        <InviteFields
          initialEmail={state.values.email}
          initialReason={state.values.reason}
          key={state.resetKey}
          pending={pending}
        />
      </form>
    </div>
  );
}
