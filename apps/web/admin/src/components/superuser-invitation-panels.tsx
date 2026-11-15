"use client";

import type { SuperuserInvitationPublic } from "@barrelsgd/api-client";
import { useActionState, useState } from "react";
import {
  type InviteFormState,
  inviteSuperuserAction,
  revokeSuperuserInvitationAction,
} from "@/app/(console)/superusers/actions";
import { REASON_MAX, REASON_MIN } from "@/lib/superuser-invitation-form";

const INITIAL: InviteFormState = {
  message: null,
  values: { email: "", reason: "" },
};

const inputClass =
  "w-full rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring";
const buttonClass =
  "hover:bg-muted rounded-md border px-3 py-1.5 text-sm font-medium transition";

/** Email and reason for a new superuser. The reason is audited, never mailed. */
export function InviteSuperuserForm() {
  const [state, action, pending] = useActionState(
    inviteSuperuserAction,
    INITIAL
  );
  // Controlled, so a refused form keeps what was typed (React resets uncontrolled fields).
  const [email, setEmail] = useState(state.values.email);
  const [reason, setReason] = useState(state.values.reason);
  const count = reason.trim().length;

  return (
    <form action={action} className="max-w-xl space-y-4">
      {state.message ? (
        <p className="text-destructive text-sm" role="alert">
          {state.message}
        </p>
      ) : null}
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
    </form>
  );
}

const WHEN = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "America/Grenada",
});

/** Open invitations, or the empty state. The section always shows. */
export function PendingInvitations({
  invitations,
}: {
  invitations: readonly SuperuserInvitationPublic[];
}) {
  if (invitations.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No pending invitations</p>
    );
  }
  return (
    <ul className="divide-y rounded-md border">
      {invitations.map((invitation) => (
        <li
          className="flex flex-wrap items-start justify-between gap-3 p-4"
          key={invitation.id}
        >
          <div className="space-y-1">
            <p className="font-medium">{invitation.email}</p>
            <p className="text-muted-foreground text-sm">
              {`Expires ${WHEN.format(new Date(invitation.expires_at))}`}
            </p>
            <p className="text-muted-foreground text-sm">{invitation.reason}</p>
          </div>
          <form action={revokeSuperuserInvitationAction}>
            <input name="invitation_id" type="hidden" value={invitation.id} />
            <button
              aria-label={`Revoke invitation for ${invitation.email}`}
              className={buttonClass}
              type="submit"
            >
              Revoke
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
