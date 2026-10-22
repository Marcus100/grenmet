import { describe, expect, it } from "vitest";
import {
  cancelOutcomeMessage,
  formatOrderMoney,
  formatOrderMoneyCode,
  friendlyOrgError,
  humanise,
  isOrderStatus,
  isTicketStatus,
  keepsKey,
  orderBadge,
  orderStatus,
  pageParam,
  refundStatus,
} from "./org-orders";

const RE_1 = /still being processed/;
const RE_2 = /changed/;
const RE_3 = /permission/;
const RE_4 = /Reload/;
const RE_5 = /queued/;
const RE_6 = /kept/;
const RE_7 = /Nothing had been paid/;

describe("status words", () => {
  it("names every state in words, not only colour", () => {
    expect(orderStatus("pending_payment").label).toBe("Awaiting payment");
    expect(orderStatus("confirmed").tone).toBe("light-success");
    expect(refundStatus("failed")).toEqual({
      label: "Refund failed",
      tone: "light-error",
    });
    expect(refundStatus("queued").label).toBe("Refund queued");
  });

  it("accepts only known filter values", () => {
    expect(isOrderStatus("refunded")).toBe(true);
    expect(isOrderStatus("paid")).toBe(false);
    expect(isTicketStatus("valid")).toBe(true);
    expect(isTicketStatus(undefined)).toBe(false);
  });
});

describe("pageParam", () => {
  it("defaults to page one for anything unusable", () => {
    expect(pageParam(undefined)).toBe(1);
    expect(pageParam("0")).toBe(1);
    expect(pageParam("-3")).toBe(1);
    expect(pageParam("abc")).toBe(1);
    expect(pageParam("3")).toBe(3);
  });
});

describe("formatOrderMoney", () => {
  it("formats minor units", () => {
    expect(formatOrderMoney(15_050, "XCD")).toBe("$150.50");
  });
});

describe("friendlyOrgError", () => {
  it("passes the API's own 409 wording through", () => {
    expect(friendlyOrgError(409, "This order is already paid")).toBe(
      "This order is already paid"
    );
  });

  it("explains idempotency refusals", () => {
    expect(
      friendlyOrgError(
        409,
        "A request with this key is still being processed; retry shortly"
      )
    ).toMatch(RE_1);
    expect(
      friendlyOrgError(
        409,
        "This Idempotency-Key was already used with a different request"
      )
    ).toMatch(RE_2);
  });

  it("words 403 and 404 with a next step", () => {
    expect(friendlyOrgError(403, null)).toMatch(RE_3);
    expect(friendlyOrgError(404, "Order not found")).toMatch(RE_4);
  });
});

describe("keepsKey", () => {
  it("keeps the key for network and server faults and in-flight replays", () => {
    expect(keepsKey(null, null)).toBe(true);
    expect(keepsKey(503, null)).toBe(true);
    expect(
      keepsKey(409, "A request with this key is still being processed")
    ).toBe(true);
  });

  it("rotates it for refusals of the content", () => {
    expect(keepsKey(409, "This order is already paid")).toBe(false);
    expect(keepsKey(400, null)).toBe(false);
    expect(keepsKey(422, null)).toBe(false);
  });
});

describe("cancelOutcomeMessage", () => {
  it("says what happened to the money", () => {
    expect(cancelOutcomeMessage("queued")).toMatch(RE_5);
    expect(cancelOutcomeMessage("kept")).toMatch(RE_6);
    expect(cancelOutcomeMessage("not_due")).toMatch(RE_7);
  });
});

describe("orderBadge", () => {
  const base = {
    active_ticket_count: 2,
    payment_method: "online" as const,
    status: "confirmed" as const,
    ticket_count: 2,
  };

  it("derives Cancelled and Free", () => {
    expect(orderBadge({ ...base, active_ticket_count: 0 }).label).toBe(
      "Cancelled"
    );
    expect(orderBadge({ ...base, payment_method: "none" }).label).toBe("Free");
    expect(orderBadge(base).label).toBe("Paid");
    expect(
      orderBadge({ ...base, ticket_count: 0, active_ticket_count: 0 }).label
    ).toBe("Paid");
  });
});

describe("money display", () => {
  it("never guesses a symbol for an unknown currency", () => {
    expect(formatOrderMoney(2500, "EUR")).toBe("EUR 25.00");
    expect(formatOrderMoneyCode(15_000, "XCD")).toBe("XCD 150.00");
  });

  it("humanises raw enums", () => {
    expect(humanise("stripe")).toBe("Stripe");
    expect(humanise("partially_refunded")).toBe("Partially refunded");
  });
});

describe("friendlyOrgError wording", () => {
  it("recognises the real in-progress string", () => {
    expect(
      friendlyOrgError(
        409,
        "A request with this key is still being processed; retry shortly"
      )
    ).toContain("still being processed");
  });

  it("formats the remaining refundable amount", () => {
    expect(
      friendlyOrgError(
        409,
        "Only 1250 minor units can still be refunded",
        "XCD"
      )
    ).toBe(
      "Only $12.50 can still be refunded. Reload the page to see the current amount."
    );
  });
});
