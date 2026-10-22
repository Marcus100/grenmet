import "server-only";

import {
  eventsOrgGetOrder,
  eventsOrgListAttendees,
  eventsOrgListOrders,
  type OrgAttendee,
  type OrgOrderDetail,
  type OrgOrderRow,
  ResponseError,
} from "@barrelsgd/api-client";
import { apiOptions } from "@/lib/api";
import { ORDER_PAGE_SIZE } from "@/lib/org-orders";
import type { OrgContext } from "./org-context";

type Ready = Extract<OrgContext, { ok: true }>;

export interface Page<T> {
  readonly count: number;
  readonly page: number;
  readonly rows: readonly T[];
  readonly totalPages: number;
}

function request(context: Ready) {
  return {
    ...apiOptions(context.accessToken),
    headers: { "X-Barrels-Organisation": context.organisationId },
  };
}

/** A 404 (another organisation's or unknown event or order) is null; the rest throws. */
async function orNull<T>(call: Promise<T>): Promise<T | null> {
  try {
    return await call;
  } catch (error) {
    if (error instanceof ResponseError && error.status === 404) {
      return null;
    }
    throw error;
  }
}

export async function getOrgOrders(
  context: Ready,
  listingId: string,
  filter: { page: number; status?: OrgOrderRow["status"] }
): Promise<Page<OrgOrderRow> | null> {
  const result = await orNull(
    eventsOrgListOrders({
      ...request(context),
      path: { listing_id: listingId },
      query: {
        page: filter.page,
        size: ORDER_PAGE_SIZE,
        ...(filter.status ? { status: filter.status } : {}),
      },
    }).unwrap()
  );
  return result
    ? {
        rows: result.data,
        count: result.count,
        page: result.page ?? filter.page,
        totalPages: result.total_pages ?? 1,
      }
    : null;
}

export async function getOrgOrder(
  context: Ready,
  orderId: string
): Promise<OrgOrderDetail | null> {
  return await orNull(
    eventsOrgGetOrder({
      ...request(context),
      path: { order_id: orderId },
    }).unwrap()
  );
}

export async function getOrgAttendees(
  context: Ready,
  listingId: string,
  filter: {
    page: number;
    status?: OrgAttendee["status"];
    tierId?: string;
  }
): Promise<Page<OrgAttendee> | null> {
  const result = await orNull(
    eventsOrgListAttendees({
      ...request(context),
      path: { listing_id: listingId },
      query: {
        page: filter.page,
        size: ORDER_PAGE_SIZE,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.tierId ? { tier_id: filter.tierId } : {}),
      },
    }).unwrap()
  );
  return result
    ? {
        rows: result.data,
        count: result.count,
        page: result.page ?? filter.page,
        totalPages: result.total_pages ?? 1,
      }
    : null;
}
