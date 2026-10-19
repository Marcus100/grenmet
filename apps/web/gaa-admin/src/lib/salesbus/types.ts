import type { RequisitionStatus } from "@barrelsgd/api-client";

/** A catalogue item as the requisition cart needs it. */
export interface CartItem {
  itemId: string;
  name: string;
  quantity: number;
  sku: string;
  unit: string;
}

export const STATUS_LABELS: Record<RequisitionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Awaiting approval",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  PARTIALLY_DELIVERED: "Partly delivered",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/** Requisitions the storekeeper still has to deliver. */
export const AWAITING_DELIVERY: RequisitionStatus[] = [
  "APPROVED",
  "PARTIALLY_DELIVERED",
];

export function formatDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "America/Grenada",
  });
}
