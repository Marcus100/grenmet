"use client";

import type {
  LocationPublic,
  RequisitionPublic,
  RequisitionStatus,
} from "@barrelsgd/api-client";
import { Badge } from "@barrelsgd/ui/components/ui/badge";
import { Button } from "@barrelsgd/ui/components/ui/button";
import { useMutation } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { formatDate, STATUS_LABELS } from "@/lib/salesbus/types";
import { cancelRequisition, errorMessage, submitRequisition } from "../api";
import { ApproveDialog, DeliverDialog, RejectDialog } from "./ActionDialogs";

const BADGE: Record<
  RequisitionStatus,
  | "light-info"
  | "light-success"
  | "light-error"
  | "light-warning"
  | "light-light"
> = {
  DRAFT: "light-light",
  SUBMITTED: "light-warning",
  APPROVED: "light-info",
  REJECTED: "light-error",
  PARTIALLY_DELIVERED: "light-info",
  DELIVERED: "light-success",
  CANCELLED: "light-light",
};

type Dialog = "approve" | "reject" | "deliver" | null;

export function RequisitionCard({
  locations,
  requisition,
}: {
  locations: LocationPublic[];
  requisition: RequisitionPublic;
}) {
  const router = useRouter();
  const [dialog, setDialog] = useState<Dialog>(null);
  const simple = useMutation({
    mutationFn: (run: () => Promise<unknown>) => run(),
  });

  async function run(action: () => Promise<unknown>, success: string) {
    try {
      await simple.mutateAsync(action);
      toast.success(success);
      router.refresh();
    } catch (caught) {
      toast.error(errorMessage(caught, "Action failed"));
    }
  }

  const hasActions =
    requisition.can_edit ||
    requisition.can_cancel ||
    requisition.can_approve ||
    requisition.can_deliver;

  return (
    <article className="rounded-xl bg-card p-4 sm:p-5">
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-bold text-foreground text-lg tracking-wide">
            {requisition.reference}
          </h3>
          <p className="text-muted-foreground text-sm">
            {requisition.requester_name} • {requisition.department_name}
            {requisition.submitted_at
              ? ` • ${formatDate(requisition.submitted_at)}`
              : ""}
          </p>
        </div>
        <Badge variant={BADGE[requisition.status]}>
          {STATUS_LABELS[requisition.status]}
        </Badge>
      </header>

      {requisition.purpose ? (
        <p className="mt-2 text-foreground text-sm">{requisition.purpose}</p>
      ) : null}
      {requisition.needed_by ? (
        <p className="text-muted-foreground text-sm">
          Needed by {formatDate(requisition.needed_by)}
        </p>
      ) : null}

      <ul className="mt-3 divide-y divide-border">
        {requisition.lines.map((line) => (
          <li
            className="flex items-center justify-between gap-3 py-2"
            key={line.id}
          >
            <div className="min-w-0">
              <p className="truncate font-semibold text-foreground text-sm sm:text-base">
                {line.item_name}
              </p>
              <p className="text-muted-foreground text-xs sm:text-sm">
                {line.sku}
              </p>
            </div>
            <p className="flex-shrink-0 text-right text-sm tabular-nums">
              {line.delivered_quantity > 0 ||
              line.approved_quantity !== null ? (
                <>
                  {line.delivered_quantity} / {line.approved_quantity ?? 0}{" "}
                  {line.unit}
                  <span className="block text-muted-foreground text-xs">
                    requested {line.requested_quantity}
                  </span>
                </>
              ) : (
                <>
                  {line.requested_quantity} {line.unit}
                </>
              )}
            </p>
          </li>
        ))}
      </ul>

      {requisition.decision_note ? (
        <p className="mt-2 text-muted-foreground text-sm">
          Note: {requisition.decision_note}
        </p>
      ) : null}

      {hasActions ? (
        <footer className="mt-3 flex flex-wrap justify-end gap-2">
          {requisition.can_edit ? (
            <Button
              disabled={simple.isPending}
              onClick={() =>
                run(
                  () => submitRequisition(requisition.id),
                  "Requisition submitted"
                )
              }
              size="sm"
            >
              Submit
            </Button>
          ) : null}
          {requisition.can_cancel ? (
            <Button
              disabled={simple.isPending}
              onClick={() =>
                run(
                  () => cancelRequisition(requisition.id),
                  "Requisition cancelled"
                )
              }
              size="sm"
              variant="outline"
            >
              Cancel
            </Button>
          ) : null}
          {requisition.can_approve ? (
            <>
              <Button
                onClick={() => setDialog("reject")}
                size="sm"
                variant="outline"
              >
                Reject
              </Button>
              <Button onClick={() => setDialog("approve")} size="sm">
                Approve
              </Button>
            </>
          ) : null}
          {requisition.can_deliver ? (
            <Button onClick={() => setDialog("deliver")} size="sm">
              Deliver
            </Button>
          ) : null}
        </footer>
      ) : null}

      {dialog === "approve" ? (
        <ApproveDialog
          onClose={() => setDialog(null)}
          requisition={requisition}
        />
      ) : null}
      {dialog === "reject" ? (
        <RejectDialog
          onClose={() => setDialog(null)}
          requisition={requisition}
        />
      ) : null}
      {dialog === "deliver" ? (
        <DeliverDialog
          locations={locations}
          onClose={() => setDialog(null)}
          requisition={requisition}
        />
      ) : null}
    </article>
  );
}
