/** Shown when the organiser has no organisation yet; the org-zone API needs one. */
export function OrgUnavailable() {
  return (
    <p
      className="rounded-2xl border border-dashed bg-card px-4 py-8 text-center text-body text-muted-foreground"
      role="status"
    >
      This organiser isn't linked to an organisation yet, so orders and
      attendees can't be shown. Ask a Barrels admin to link it.
    </p>
  );
}
