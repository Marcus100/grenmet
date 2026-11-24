import { describe, expect, it } from "vitest";
import {
  billingFailure,
  billingFailureNeedsReport,
  PLAN_ADMIN_REQUIRED,
} from "@/lib/billing-errors";
import { apiError } from "@/test/studio";

const ALREADY = /already has a subscription/u;
const RELOAD = /Reload/u;

describe("billingFailure", () => {
  it("says billing is not switched on yet for a 503", () => {
    const failure = billingFailure(apiError(503));
    expect(failure.kind).toBe("unavailable");
    expect(failure.message).toBe("Billing is not switched on yet.");
  });

  it("says only the owner or an admin can manage the plan for a 403", () => {
    expect(billingFailure(apiError(403))).toEqual(PLAN_ADMIN_REQUIRED);
    expect(PLAN_ADMIN_REQUIRED.message).toBe(
      "Only the business owner or an admin can manage the plan."
    );
  });

  it("says a checkout already exists for a 409, with a reload as the next step", () => {
    const failure = billingFailure(apiError(409));
    expect(failure.kind).toBe("conflict");
    expect(failure.message).toMatch(ALREADY);
    expect(failure.nextStep).toMatch(RELOAD);
  });

  it("says the plan is not sold in XCD for a 422", () => {
    expect(billingFailure(apiError(422))).toMatchObject({
      kind: "invalid",
      message: "This plan is not sold in XCD yet.",
    });
  });

  it("says the plan was not found for a 404", () => {
    expect(billingFailure(apiError(404)).kind).toBe("not_found");
  });

  it("gives a sign-in message for a 401 without sending the person to sign-in", () => {
    const failure = billingFailure(apiError(401));
    expect(failure.kind).toBe("unavailable");
    expect(failure.kind).not.toBe("signed_out");
  });

  it("falls back to a plain unavailable message for other statuses", () => {
    expect(billingFailure(apiError(500))).toMatchObject({
      kind: "unavailable",
      message: "The plan is not available right now.",
    });
  });

  it("rethrows errors that are not API responses", () => {
    expect(() => billingFailure(new TypeError("boom"))).toThrow("boom");
  });
});

describe("billingFailureNeedsReport", () => {
  it("does not report expected refusals", () => {
    for (const status of [403, 404, 409, 422, 503]) {
      expect(billingFailureNeedsReport(apiError(status))).toBe(false);
    }
  });

  it("reports every 401, server faults and unknown errors", () => {
    expect(billingFailureNeedsReport(apiError(401))).toBe(true);
    expect(billingFailureNeedsReport(apiError(500))).toBe(true);
    expect(billingFailureNeedsReport(new TypeError("boom"))).toBe(true);
  });
});
