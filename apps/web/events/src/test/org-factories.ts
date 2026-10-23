import type {
  OrgAttendee,
  OrgOrderDetail,
  OrgOrderRow,
} from "@barrelsgd/api-client";

export const LISTING_ID = "11111111-1111-4111-8111-111111111111";
export const ORDER_ID = "22222222-2222-4222-8222-222222222222";

export function makeOrderRow(
  overrides: Partial<OrgOrderRow> = {}
): OrgOrderRow {
  return {
    id: ORDER_ID,
    listing_id: LISTING_ID,
    status: "confirmed",
    channel: "online",
    payment_method: "online",
    buyer_name: "Ana Tester",
    total_minor: 15_000,
    currency: "XCD",
    collected_minor: 15_000,
    refunded_minor: 0,
    ticket_count: 2,
    active_ticket_count: 2,
    created_at: "2026-10-20T15:00:00Z",
    paid_at: "2026-10-20T15:05:00Z",
    ...overrides,
  };
}

export function makeOrderDetail(
  overrides: Partial<OrgOrderDetail> = {}
): OrgOrderDetail {
  return {
    ...makeOrderRow(),
    listing_title: "Feel Free Sunset",
    buyer_email: "ana@example.test",
    buyer_phone: "+1 473 555 0100",
    refund_status: "none",
    payment_expires_at: null,
    items: [
      {
        tier_id: "33333333-3333-4333-8333-333333333333",
        tier_name: "General",
        quantity: 2,
        unit_price_minor: 7500,
      },
    ],
    tickets: [
      {
        id: "44444444-4444-4444-8444-444444444444",
        code: "AAAAA-BBBBB",
        status: "valid",
        tier_name: "General",
        admitted_at: null,
      },
    ],
    payment: {
      intent_id: "55555555-5555-4555-8555-555555555555",
      provider: "manual",
      status: "succeeded",
      captured_minor: 15_000,
      refunded_minor: 0,
      refundable_minor: 15_000,
    },
    ...overrides,
  } as OrgOrderDetail;
}

export function makeAttendee(
  overrides: Partial<OrgAttendee> = {}
): OrgAttendee {
  return {
    ticket_id: "44444444-4444-4444-8444-444444444444",
    order_id: ORDER_ID,
    code: "AAAAA-BBBBB",
    status: "valid",
    tier_id: "33333333-3333-4333-8333-333333333333",
    tier_name: "General",
    holder_name: "Ana Tester",
    channel: "online",
    admitted_at: null,
    ...overrides,
  };
}
