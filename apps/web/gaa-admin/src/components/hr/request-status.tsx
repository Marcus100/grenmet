import { Badge } from "@barrelsgd/ui/components/ui/badge";

type BadgeVariant =
  | "default"
  | "outline"
  | "secondary"
  | "destructive"
  | "solid-warning";

const STATUS_PRESENTATION: Record<
  string,
  { label: string; variant: BadgeVariant }
> = {
  DRAFT: { label: "Draft", variant: "outline" },
  SUBMITTED: { label: "Submitted", variant: "outline" },
  APPROVED: { label: "Approved", variant: "default" },
  // Returned asks the author to act, so it takes the amber warning tone.
  // Rejected is final, so it takes the destructive tone: they never look alike.
  RETURNED: { label: "Returned", variant: "solid-warning" },
  REJECTED: { label: "Rejected", variant: "destructive" },
  CANCELLED: { label: "Cancelled", variant: "secondary" },
};

/** Statuses in which the author may edit a form and submit it again. */
export function isEditableStatus(status: string | null | undefined): boolean {
  return status === "DRAFT" || status === "RETURNED";
}

/** The line shown above an editor that has loaded a saved or returned form. */
export function editingHint(record: {
  status: string;
  returned_reason?: string | null;
}): string {
  if (record.status === "RETURNED") {
    return record.returned_reason
      ? `Returned for changes: ${record.returned_reason}. Edit it and submit again.`
      : "Returned for changes. Edit it and submit again.";
  }
  return record.status === "DRAFT"
    ? "Editing saved draft"
    : "Submitted copy — Reset to start a new form";
}

export function RequestStatusBadge({
  status,
}: {
  status: string | null | undefined;
}) {
  const known = status ? STATUS_PRESENTATION[status] : undefined;
  return (
    <Badge variant={known?.variant ?? "outline"}>
      {known?.label ?? status ?? "Unknown"}
    </Badge>
  );
}

/** The approver's reason, shown beneath the Returned badge. */
export function ReturnedReason({
  status,
  reason,
}: {
  status: string | null | undefined;
  reason: string | null | undefined;
}) {
  if (status !== "RETURNED" || !reason) {
    return null;
  }
  return (
    <p className="text-muted-foreground mt-1 max-w-xs text-xs">{reason}</p>
  );
}
