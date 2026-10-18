import {
  itemCreateSchema,
  locationCreateSchema,
  requisitionApproveSchema,
  requisitionCreateSchema,
  requisitionDeliverSchema,
  requisitionRejectSchema,
  stockMovementCreateSchema,
  storesApproveRequisition,
  storesCancelRequisition,
  storesCreateItem,
  storesCreateLocation,
  storesCreateRequisition,
  storesCreateStockMovement,
  storesDeliverRequisition,
  storesRejectRequisition,
  storesSubmitRequisition,
} from "@barrelsgd/api-client";

// Client-side mutations through the gaa-admin API proxy. Bodies are parsed with
// the generated Zod schemas first so malformed input never reaches the API.

export const createRequisition = (body: unknown) =>
  storesCreateRequisition({
    body: requisitionCreateSchema.parse(body),
  }).unwrap();

export const submitRequisition = (requisitionId: string) =>
  storesSubmitRequisition({ path: { requisition_id: requisitionId } }).unwrap();

export const cancelRequisition = (requisitionId: string) =>
  storesCancelRequisition({ path: { requisition_id: requisitionId } }).unwrap();

export const approveRequisition = (requisitionId: string, body: unknown) =>
  storesApproveRequisition({
    path: { requisition_id: requisitionId },
    body: requisitionApproveSchema.parse(body),
  }).unwrap();

export const rejectRequisition = (requisitionId: string, body: unknown) =>
  storesRejectRequisition({
    path: { requisition_id: requisitionId },
    body: requisitionRejectSchema.parse(body),
  }).unwrap();

export const deliverRequisition = (requisitionId: string, body: unknown) =>
  storesDeliverRequisition({
    path: { requisition_id: requisitionId },
    body: requisitionDeliverSchema.parse(body),
  }).unwrap();

export const createItem = (body: unknown) =>
  storesCreateItem({ body: itemCreateSchema.parse(body) }).unwrap();

export const createLocation = (body: unknown) =>
  storesCreateLocation({ body: locationCreateSchema.parse(body) }).unwrap();

export const recordStockMovement = (body: unknown) =>
  storesCreateStockMovement({
    body: stockMovementCreateSchema.parse(body),
  }).unwrap();

export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const data = (error as { data?: unknown }).data;
    if (data && typeof data === "object") {
      const detail = (data as { detail?: unknown }).detail;
      if (typeof detail === "string") return detail;
    }
    const issues = (error as { issues?: { message?: unknown }[] }).issues;
    const first = issues?.[0]?.message;
    if (typeof first === "string") return first;
  }
  return fallback;
}
