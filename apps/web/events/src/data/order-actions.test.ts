import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeOrderDetail } from "@/test/org-factories";

const RE_1 = /permission/;
const RE_2 = /already waiting/;

const resolveOrgContext = vi.fn();
const reportError = vi.fn();
const recordPayment = vi.fn();
const refund = vi.fn();
const cancelOrderCall = vi.fn();
const cancelEventCall = vi.fn();

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("./org-context", () => ({
  resolveOrgContext: () => resolveOrgContext(),
}));
vi.mock("@/lib/report-error", () => ({
  reportError: (...args: unknown[]) => reportError(...args),
}));
vi.mock("@/lib/api", () => ({ apiOptions: () => ({}) }));
vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  eventsOrgRecordManualPayment: (...a: unknown[]) => recordPayment(...a),
  eventsOrgRefundOrder: (...a: unknown[]) => refund(...a),
  eventsOrgCancelOrder: (...a: unknown[]) => cancelOrderCall(...a),
  eventsOrgCancelEvent: (...a: unknown[]) => cancelEventCall(...a),
}));

const { cancelEventWithRefund, cancelOrder, recordManualPayment, refundOrder } =
  await import("./order-actions");

const ORDER = "22222222-2222-4222-8222-222222222222";
const KEY = "99999999-9999-4999-8999-999999999999";

function responseError(status: number, data: unknown) {
  return new ResponseError({
    data,
    status,
    statusText: "",
    request: new Request("http://api.test"),
    response: new Response(),
  });
}

const unwrapped = (value: unknown) => ({
  unwrap: () => Promise.resolve(value),
});
const failing = (error: unknown) => ({
  unwrap: () => Promise.reject(error),
});

beforeEach(() => {
  for (const mock of [
    resolveOrgContext,
    reportError,
    recordPayment,
    refund,
    cancelOrderCall,
    cancelEventCall,
  ]) {
    mock.mockReset();
  }
  resolveOrgContext.mockResolvedValue({
    ok: true,
    accessToken: "tok",
    organisationId: "org_1",
  });
});

describe("recordManualPayment", () => {
  const input = {
    orderId: ORDER,
    idempotencyKey: KEY,
    method: "cash" as const,
    reference: " R-12 ",
  };

  it("sends the server-resolved organisation and the idempotency key", async () => {
    recordPayment.mockReturnValue(unwrapped(makeOrderDetail()));
    const result = await recordManualPayment(input);
    expect(result.ok).toBe(true);
    expect(recordPayment).toHaveBeenCalledWith(
      expect.objectContaining({
        headers: {
          "X-Barrels-Organisation": "org_1",
          "Idempotency-Key": KEY,
        },
        path: { order_id: ORDER },
        body: { method: "cash", reference: "R-12" },
      })
    );
  });

  it("asks a signed-out member to sign in without calling the API", async () => {
    resolveOrgContext.mockResolvedValue({ ok: false, reason: "signed-out" });
    expect(await recordManualPayment(input)).toEqual({
      ok: false,
      error: "sign-in-required",
      keepKey: false,
    });
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("says so when the organiser has no organisation", async () => {
    resolveOrgContext.mockResolvedValue({
      ok: false,
      reason: "no-organisation",
    });
    const result = await recordManualPayment(input);
    expect(result.ok).toBe(false);
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("rejects a malformed key or id before calling the API", async () => {
    const result = await recordManualPayment({
      ...input,
      idempotencyKey: "not-a-uuid",
    });
    expect(result.ok).toBe(false);
    expect(recordPayment).not.toHaveBeenCalled();
  });

  it("shows the API's 409 and rotates the key", async () => {
    recordPayment.mockReturnValue(
      failing(responseError(409, { detail: "This order is already paid" }))
    );
    expect(await recordManualPayment(input)).toEqual({
      ok: false,
      error: "This order is already paid",
      keepKey: false,
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("keeps the key and reports on a server fault", async () => {
    const error = responseError(503, { detail: "down" });
    recordPayment.mockReturnValue(failing(error));
    expect(await recordManualPayment(input)).toEqual({
      ok: false,
      error: "Something went wrong. Try again shortly.",
      keepKey: true,
    });
    expect(reportError).toHaveBeenCalledWith(error, "events-orders");
  });

  it("keeps the key on a network failure", async () => {
    recordPayment.mockReturnValue(failing(new TypeError("fetch failed")));
    const result = await recordManualPayment(input);
    expect(result).toMatchObject({ ok: false, keepKey: true });
  });

  it("keeps the key while the first attempt is still running", async () => {
    recordPayment.mockReturnValue(
      failing(
        responseError(409, {
          detail:
            "A request with this key is still being processed; retry shortly",
        })
      )
    );
    expect(await recordManualPayment(input)).toMatchObject({
      ok: false,
      keepKey: true,
    });
  });

  it("maps a 403 to a permission message", async () => {
    recordPayment.mockReturnValue(failing(responseError(403, {})));
    const result = await recordManualPayment(input);
    expect(result).toMatchObject({ ok: false, keepKey: false });
    expect(result.ok ? "" : result.error).toMatch(RE_1);
  });
});

describe("refundOrder", () => {
  it("sends a partial amount in minor units", async () => {
    refund.mockReturnValue(unwrapped(makeOrderDetail()));
    await refundOrder({
      orderId: ORDER,
      idempotencyKey: KEY,
      amountMinor: 2500,
      reason: "Buyer asked",
    });
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { amount_minor: 2500, reason: "Buyer asked" },
      })
    );
  });

  it("omits the amount for a full refund", async () => {
    refund.mockReturnValue(unwrapped(makeOrderDetail()));
    await refundOrder({
      orderId: ORDER,
      idempotencyKey: KEY,
      reason: "Event changed",
    });
    expect(refund).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { amount_minor: null, reason: "Event changed" },
      })
    );
  });

  it("rejects a zero amount or a missing reason", async () => {
    expect(
      (
        await refundOrder({
          orderId: ORDER,
          idempotencyKey: KEY,
          amountMinor: 0,
          reason: "ok then",
        })
      ).ok
    ).toBe(false);
    expect(
      (await refundOrder({ orderId: ORDER, idempotencyKey: KEY, reason: "x" }))
        .ok
    ).toBe(false);
    expect(refund).not.toHaveBeenCalled();
  });

  it("shows the queued-refund 409 as the API words it", async () => {
    refund.mockReturnValue(
      failing(
        responseError(409, {
          detail:
            "A refund for this order is already waiting for the payment provider",
        })
      )
    );
    const result = await refundOrder({
      orderId: ORDER,
      idempotencyKey: KEY,
      reason: "Event changed",
    });
    expect(result.ok ? "" : result.error).toMatch(RE_2);
  });
});

describe("cancelOrder", () => {
  it("passes the refund choice and returns the outcome", async () => {
    cancelOrderCall.mockReturnValue(
      unwrapped({ order: makeOrderDetail(), refund_outcome: "queued" })
    );
    const result = await cancelOrder({
      orderId: ORDER,
      refund: "follow_policy",
      reason: "",
    });
    expect(result.ok && result.data.outcome).toBe("queued");
    expect(cancelOrderCall).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { refund: "follow_policy", reason: null },
      })
    );
  });

  it("rejects an unknown refund choice", async () => {
    const result = await cancelOrder({
      orderId: ORDER,
      refund: "everything" as never,
      reason: "",
    });
    expect(result.ok).toBe(false);
    expect(cancelOrderCall).not.toHaveBeenCalled();
  });
});

describe("cancelEventWithRefund", () => {
  it("returns the counts", async () => {
    cancelEventCall.mockReturnValue(
      unwrapped({
        listing_id: ORDER,
        status: "cancelled",
        tickets_cancelled: 5,
        orders_refunded: 1,
        orders_queued: 2,
        orders_kept: 0,
        refunds_failed: 1,
        orders_released: 3,
      })
    );
    const result = await cancelEventWithRefund(ORDER, "full");
    expect(result).toEqual({
      ok: true,
      data: {
        ticketsCancelled: 5,
        ordersRefunded: 1,
        ordersQueued: 2,
        ordersKept: 0,
        refundsFailed: 1,
        ordersReleased: 3,
      },
    });
    expect(cancelEventCall).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { confirm: true, refund: "full" },
        headers: { "X-Barrels-Organisation": "org_1" },
      })
    );
  });

  it("shows a 403 for a member without the right", async () => {
    cancelEventCall.mockReturnValue(
      failing(responseError(403, { detail: "You can't do that here" }))
    );
    const result = await cancelEventWithRefund(ORDER, "none");
    expect(result.ok ? "" : result.error).toBe("You can't do that here");
  });
});
