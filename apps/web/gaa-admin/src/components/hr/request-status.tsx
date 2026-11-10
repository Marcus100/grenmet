import { type RequestStatus, requestStatus } from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";

type BadgeVariant =
  | "default"
  | "outline"
  | "secondary"
  | "destructive"
  | "solid-warning";

// Keyed by the generated enum, so a new backend status fails type-check here.
const STATUS_PRESENTATION: Record<
  RequestStatus,
  { label: string; variant: BadgeVariant }
> = {
  [requestStatus.DRAFT]: { label: "Draft", variant: "outline" },
  [requestStatus.SUBMITTED]: { label: "Submitted", variant: "outline" },
  [requestStatus.APPROVED]: { label: "Approved", variant: "default" },
  // Returned asks the author to act, so it takes the amber warning tone.
  // Rejected is final, so it takes the destructive tone: they never look alike.
  [requestStatus.RETURNED]: { label: "Returned", variant: "solid-warning" },
  [requestStatus.REJECTED]: { label: "Rejected", variant: "destructive" },
  [requestStatus.CANCELLED]: { label: "Cancelled", variant: "secondary" },
};

/**
 * Statuses in which the author may edit a form and submit it again. Mirrors
 * EDITABLE_STATUSES in apps/api/fastapi/src/hr/models.py; the parity test in
 * request-status.parity.test.ts fails if either side changes alone.
 */
export const EDITABLE_REQUEST_STATUSES: readonly RequestStatus[] = [
  requestStatus.DRAFT,
  requestStatus.RETURNED,
];

/** Whether the author may edit a form and submit it again. */
export function isEditableStatus(
  status: RequestStatus | null | undefined
): boolean {
  return status != null && EDITABLE_REQUEST_STATUSES.includes(status);
}

/** The line shown above an editor that has loaded a saved or returned form. */
export function editingHint(record: {
  status: RequestStatus;
  returned_reason?: string | null;
}): string {
  if (record.status === requestStatus.RETURNED) {
    return record.returned_reason
      ? `Returned for changes: ${record.returned_reason}. Edit it and submit again.`
      : "Returned for changes. Edit it and submit again.";
  }
  return record.status === requestStatus.DRAFT
    ? "Editing saved draft"
    : "Submitted copy — Reset to start a new form";
}

export function RequestStatusBadge({
  status,
}: {
  status: RequestStatus | null | undefined;
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
  status: RequestStatus | null | undefined;
  reason: string | null | undefined;
}) {
  if (status !== requestStatus.RETURNED || !reason) {
    return null;
  }
  return (
    <p className="text-muted-foreground mt-1 max-w-xs text-xs">{reason}</p>
  );
}
