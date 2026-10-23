"use server";

import {
  type CancelResult,
  eventsCancelEvent,
  eventsOrgCancelEvent,
  eventsOrgCancelOrder,
  eventsOrgRecordManualPayment,
  eventsOrgRefundOrder,
  type OrgOrderDetail,
  ResponseError,
} from "@barrelsgd/api-client";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { apiOptions } from "@/lib/api";
import {
  CANCEL_FORBIDDEN,
  type CancelCounts,
  COULDNT_CONFIRM,
  friendlyOrgError,
  keepsKey,
  type RefundChoice,
} from "@/lib/org-orders";
import { reportError } from "@/lib/report-error";
import { getSession } from "@/lib/session";
import { SIGN_IN_REQUIRED } from "./action-result";
import { type OrgContext, resolveOrgContext } from "./org-context";
import { chosenOrganiser } from "./organiser-choice";

/**
 * Organiser money actions. Each one re-checks the session and resolves the
 * organisation on the server from the member's own organiser workspace; the
 * browser sends only ids of the thing being changed, the form fields and an
 * Idempotency-Key. FastAPI still enforces role, entitlement and ownership.
 * `keepKey` tells the form whether to resend the same key (the first try may
 * have landed) or to rotate it (a refusal of the content).
 */
export type OrderActionResult<T> =
  | { readonly data: T; readonly ok: true }
  | { readonly error: string; readonly keepKey: boolean; readonly ok: false };

const NO_ORGANISATION =
  "This organiser isn't linked to an organisation yet, so orders can't be managed here.";
const CHECK_FORM = "Check the form and try again.";

const id = z.uuid();
const key = z.uuid();
const choice = z.enum(["follow_policy", "full", "none"]);

function refuse(error: string, keepKey = false): OrderActionResult<never> {
  return { ok: false, error, keepKey };
}

function detailOf(error: ResponseError): string | null {
  const data: unknown = error.data;
  if (typeof data !== "object" || data === null || !("detail" in data)) {
    return null;
  }
  const { detail } = data;
  return typeof detail === "string" ? detail : null;
}

/** Turns a thrown error into the refusal the form shows. */
function failureOf(
  error: unknown,
  currency: string,
  forbidden?: string
): OrderActionResult<never> {
  if (error instanceof ResponseError && error.status === 401) {
    return refuse(SIGN_IN_REQUIRED);
  }
  if (
    error instanceof ResponseError &&
    forbidden &&
    [403, 404].includes(error.status)
  ) {
    return refuse(forbidden);
  }
  if (
    error instanceof ResponseError &&
    error.status >= 400 &&
    error.status < 500
  ) {
    const detail = detailOf(error);
    return refuse(
      friendlyOrgError(error.status, detail, currency),
      keepsKey(error.status, detail)
    );
  }
  reportError(error, "events-orders");
  return refuse(COULDNT_CONFIRM, true);
}

async function run<T>(
  call: (
    options: Awaited<ReturnType<typeof apiOptions>> & {
      headers: { "X-Barrels-Organisation": string };
    }
  ) => Promise<T>,
  paths: readonly string[],
  currency = "XCD",
  forbidden?: string
): Promise<OrderActionResult<T>> {
  const context: OrgContext = await resolveOrgContext();
  if (!context.ok) {
    return context.reason === "signed-out"
      ? refuse(SIGN_IN_REQUIRED)
      : refuse(NO_ORGANISATION);
  }
  try {
    const data = await call({
      ...(await apiOptions(context.accessToken)),
      headers: { "X-Barrels-Organisation": context.organisationId },
    });
    for (const path of paths) {
      revalidatePath(path);
    }
    return { ok: true, data };
  } catch (error) {
    return failureOf(error, currency, forbidden);
  }
}

const ORDER_PATHS = ["/dash/events"] as const;

const paymentInput = z.object({
  orderId: id,
  idempotencyKey: key,
  method: z.enum(["cash", "bank_transfer"]),
  reference: z.string().trim().max(200),
});

/** Display only: the ISO code used to word an amount in an error message. */
const currencyCode = z
  .string()
  .regex(/^[A-Z]{3}$/)
  .optional();

/** Staff received cash or a bank transfer for a waiting order; tickets issue now. */
export async function recordManualPayment(
  input: z.input<typeof paymentInput>
): Promise<OrderActionResult<OrgOrderDetail>> {
  const parsed = paymentInput.safeParse(input);
  if (!parsed.success) {
    return refuse(CHECK_FORM);
  }
  const { orderId, idempotencyKey, method, reference } = parsed.data;
  return await run(
    async (options) =>
      await eventsOrgRecordManualPayment({
        ...options,
        headers: {
          ...options.headers,
          "Idempotency-Key": idempotencyKey,
        },
        path: { order_id: orderId },
        body: { method, reference: reference || null },
      }).unwrap(),
    ORDER_PATHS
  );
}

const refundInput = z.object({
  orderId: id,
  idempotencyKey: key,
  // Omitted means everything still refundable.
  amountMinor: z.number().int().min(1).max(1_000_000_000).optional(),
  reason: z.string().trim().min(3).max(500),
  currency: currencyCode,
});

/** Hands money back for a paid online order: all of it or a part. */
export async function refundOrder(
  input: z.input<typeof refundInput>
): Promise<OrderActionResult<OrgOrderDetail>> {
  const parsed = refundInput.safeParse(input);
  if (!parsed.success) {
    return refuse(
      "Give a reason of at least 3 characters and an amount above zero."
    );
  }
  const { orderId, idempotencyKey, amountMinor, reason, currency } =
    parsed.data;
  return await run(
    async (options) =>
      await eventsOrgRefundOrder({
        ...options,
        headers: {
          ...options.headers,
          "Idempotency-Key": idempotencyKey,
        },
        path: { order_id: orderId },
        body: { amount_minor: amountMinor ?? null, reason },
      }).unwrap(),
    ORDER_PATHS,
    currency
  );
}

const cancelOrderInput = z.object({
  orderId: id,
  refund: choice,
  reason: z.string().trim().max(300),
});

export interface OrderCancelled {
  readonly order: OrgOrderDetail;
  readonly outcome: "kept" | "not_due" | "queued" | "refunded";
}

/** Cancels one order; its seats go back on sale. Protected by the order's state. */
export async function cancelOrder(
  input: z.input<typeof cancelOrderInput>
): Promise<OrderActionResult<OrderCancelled>> {
  const parsed = cancelOrderInput.safeParse(input);
  if (!parsed.success) {
    return refuse(CHECK_FORM);
  }
  const { orderId, refund, reason } = parsed.data;
  return await run(async (options) => {
    const result = await eventsOrgCancelOrder({
      ...options,
      path: { order_id: orderId },
      body: { refund, reason: reason || null },
    }).unwrap();
    return { order: result.order, outcome: result.refund_outcome };
  }, ORDER_PATHS);
}

const cancelEventInput = z.object({ listingId: id, refund: choice });

/** Cancels a published event with the organiser's choice for money already paid. */
export async function cancelEventWithRefund(
  listingId: string,
  refund: RefundChoice
): Promise<OrderActionResult<CancelCounts>> {
  const parsed = cancelEventInput.safeParse({ listingId, refund });
  if (!parsed.success) {
    return refuse(CHECK_FORM);
  }
  const { listingId: id, refund: choice } = parsed.data;
  const toCounts = (result: CancelResult): CancelCounts => ({
    ticketsCancelled: result.tickets_cancelled,
    ordersRefunded: result.orders_refunded ?? 0,
    ordersQueued: result.orders_queued ?? 0,
    ordersKept: result.orders_kept ?? 0,
    refundsFailed: result.refunds_failed ?? 0,
    ordersReleased: result.orders_released ?? 0,
  });
  const paths = ["/dash/events", "/events"];
  const context = await resolveOrgContext();
  if (!context.ok && context.reason === "no-organisation") {
    // Only an organiser with no organisation uses the organiser endpoint, which
    // takes the same refund choice. A refusal from the org zone is never
    // retried through it.
    const session = await getSession();
    if (!session) {
      return refuse(SIGN_IN_REQUIRED);
    }
    try {
      const organiser = await chosenOrganiser();
      const result = await eventsCancelEvent({
        ...(await apiOptions(session.accessToken)),
        path: { listing_id: id },
        query: organiser ? { organiser } : {},
        body: { confirm: true, refund: choice },
      }).unwrap();
      for (const path of paths) {
        revalidatePath(path);
      }
      return { ok: true, data: toCounts(result) };
    } catch (error) {
      return failureOf(error, "XCD");
    }
  }
  return await run(
    async (options) =>
      toCounts(
        await eventsOrgCancelEvent({
          ...options,
          path: { listing_id: id },
          body: { confirm: true, refund: choice },
        }).unwrap()
      ),
    paths,
    "XCD",
    CANCEL_FORBIDDEN
  );
}
