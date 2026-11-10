import {
  listingUpsertPropertiesStatusEnum,
  orderPublicPropertiesStatusEnum,
  orgAttendeePropertiesStatusEnum,
  orgOrderDetailPropertiesRefundStatusEnum,
} from "@barrelsgd/api-client";
import { describe, expect, it } from "vitest";
import { LISTING_STATUS_BADGE } from "@/lib/listing-status";
import { orderStatus, refundStatus, ticketStatus } from "@/lib/org-orders";

/*
 * Every status value the API can send has a label in the UI. The values come
 * from the generated enums (themselves generated from the FastAPI schemas), so
 * a new backend status with no label fails here, not on a screen.
 */
describe("every backend status has a UI label", () => {
  it.each(Object.values(listingUpsertPropertiesStatusEnum))(
    "listing status %s",
    (value) => {
      expect(LISTING_STATUS_BADGE[value].label).not.toBe("");
    }
  );

  it.each(Object.values(orderPublicPropertiesStatusEnum))(
    "order status %s",
    (value) => {
      expect(orderStatus(value).label).not.toBe("");
    }
  );

  it.each(Object.values(orgAttendeePropertiesStatusEnum))(
    "ticket status %s",
    (value) => {
      expect(ticketStatus(value).label).not.toBe("");
    }
  );

  it.each(Object.values(orgOrderDetailPropertiesRefundStatusEnum))(
    "refund status %s",
    (value) => {
      expect(refundStatus(value).label).not.toBe("");
    }
  );
});
