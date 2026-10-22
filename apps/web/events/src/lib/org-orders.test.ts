import { describe, expect, it } from "vitest";
import {
  cancelOutcomeMessage,
  formatOrderMoney,
  friendlyOrgError,
  isOrderStatus,
  isTicketStatus,
  keepsKey,
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
