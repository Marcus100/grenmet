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

async function request(context: Ready) {
  return {
    ...(await apiOptions(context.accessToken)),
    headers: { "X-Barrels-Organisation": context.organisationId },
  };
}

/**
 * What a read found. A 404 (another organisation's or unknown event or order)
 * is `not-found`; a 403 (the member's role lacks the right) is `forbidden`, so
 * the page can say so; anything else throws to `error.tsx`.
 */
export type OrgRead<T> =
  | { readonly kind: "forbidden" }
  | { readonly kind: "not-found" }
  | { readonly kind: "ok"; readonly value: T };

async function read<T, U>(
  call: Promise<T>,
  map: (value: T) => U
): Promise<OrgRead<U>> {
  try {
    return { kind: "ok", value: map(await call) };
  } catch (error) {
    if (error instanceof ResponseError && error.status === 404) {
      return { kind: "not-found" };
    }
    if (error instanceof ResponseError && error.status === 403) {
      return { kind: "forbidden" };
    }
    throw error;
  }
}

export async function getOrgOrders(
  context: Ready,
  listingId: string,
  filter: { page: number; status?: OrgOrderRow["status"] }
): Promise<OrgRead<Page<OrgOrderRow>>> {
  return read(
    eventsOrgListOrders({
      ...(await request(context)),
      path: { listing_id: listingId },
      query: {
        page: filter.page,
        size: ORDER_PAGE_SIZE,
        ...(filter.status ? { status: filter.status } : {}),
      },
    }).unwrap(),
    (result) => ({
      rows: result.data,
      count: result.count,
      page: result.page ?? filter.page,
      totalPages: result.total_pages ?? 1,
    })
  );
}

export async function getOrgOrder(
  context: Ready,
  orderId: string
): Promise<OrgRead<OrgOrderDetail>> {
  return read(
    eventsOrgGetOrder({
      ...(await request(context)),
      path: { order_id: orderId },
    }).unwrap(),
    (order) => order
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
): Promise<OrgRead<Page<OrgAttendee>>> {
  return read(
    eventsOrgListAttendees({
      ...(await request(context)),
      path: { listing_id: listingId },
      query: {
        page: filter.page,
        size: ORDER_PAGE_SIZE,
        ...(filter.status ? { status: filter.status } : {}),
        ...(filter.tierId ? { tier_id: filter.tierId } : {}),
      },
    }).unwrap(),
    (result) => ({
      rows: result.data,
      count: result.count,
      page: result.page ?? filter.page,
      totalPages: result.total_pages ?? 1,
    })
  );
}
