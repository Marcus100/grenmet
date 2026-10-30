/** Shown when the organiser has no organisation yet; the org-zone API needs one. */
export function OrgUnavailable() {
  return (
    <p
      className="bg-card text-body text-muted-foreground rounded-2xl border border-dashed px-4 py-8 text-center"
      role="status"
    >
      This organiser isn't linked to an organisation yet, so orders and
      attendees can't be shown. Ask a Barrels admin to link it.
    </p>
  );
}

/** The member's role in the organisation doesn't include this screen. */
export function OrgForbidden({ what }: { what: string }) {
  return (
    <p
      className="bg-card text-body text-muted-foreground rounded-2xl border border-dashed px-4 py-8 text-center"
      role="status"
    >
      You don't have access to {what} for this organisation (your role or the
      organisation's Events access). Ask an owner or Barrels support.
    </p>
  );
}
