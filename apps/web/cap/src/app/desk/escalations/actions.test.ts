import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  class FakeAuthApiError extends Error {
    status: number;
    detail: string;
    constructor(status: number, detail: string) {
      super(detail);
      this.status = status;
      this.detail = detail;
    }
  }
  return {
    FakeAuthApiError,
    getAlert: vi.fn(),
    getDeskGate: vi.fn(),
    raiseEscalation: vi.fn(),
    reportError: vi.fn(),
  };
});

vi.mock("@barrelsgd/auth", () => ({
  isAuthApiError: (error: unknown) => error instanceof mocks.FakeAuthApiError,
}));
vi.mock("@/lib/desk/gate", () => ({ getDeskGate: mocks.getDeskGate }));
vi.mock("@/lib/desk/api", () => ({
  getAlert: mocks.getAlert,
  raiseEscalation: mocks.raiseEscalation,
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.reportError }));

import { raiseToWarningAction } from "./actions";

const { FakeAuthApiError } = mocks;
const PRODUCT_ID = "11111111-2222-4333-8444-555555555555";
const ALERT_ID = "66666666-7777-4888-8999-000000000000";
const STAFF = {
  accessToken: "token-abc",
  email: "forecaster@example.org",
  name: "Forecaster",
  permissions: { create: true, read: true } as never,
  status: "staff",
  userId: "u1",
};
function alertIn(lifecycle_state: string) {
  return { allowed_actions: [], lifecycle_state } as never;
}
const VALID = {
  awarenessLevel: "orange",
  overrideReason: null,
  productId: PRODUCT_ID,
  revision: 3,
};

describe("raiseToWarningAction", () => {
  beforeEach(() => {
    mocks.getAlert.mockReset();
    mocks.getDeskGate.mockReset();
    mocks.raiseEscalation.mockReset();
    mocks.reportError.mockReset();
  });

  it("asks for sign-in when the session has ended", async () => {
    mocks.getDeskGate.mockResolvedValue({ status: "signed-out" });
    const outcome = await raiseToWarningAction(VALID);
    expect(outcome).toMatchObject({ ok: false, error: { kind: "session" } });
    expect(mocks.raiseEscalation).not.toHaveBeenCalled();
  });

  it("refuses an account that cannot create warnings", async () => {
    mocks.getDeskGate.mockResolvedValue({
      ...STAFF,
      permissions: { create: false, read: true },
    });
    const outcome = await raiseToWarningAction(VALID);
    expect(outcome).toMatchObject({ ok: false, error: { status: 403 } });
    expect(mocks.raiseEscalation).not.toHaveBeenCalled();
  });

  it("never offers green as a raised colour", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    const outcome = await raiseToWarningAction({
      ...VALID,
      awarenessLevel: "green",
    });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(mocks.raiseEscalation).not.toHaveBeenCalled();
  });

  it("rejects a malformed product id before any call", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    const outcome = await raiseToWarningAction({
      ...VALID,
      productId: "not-a-uuid",
    });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(mocks.raiseEscalation).not.toHaveBeenCalled();
  });

  it("sends the API body in its own shape and trims the reason", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.raiseEscalation.mockResolvedValue({
      alert_id: ALERT_ID,
      created: true,
      source: { kind: "flood", product_id: PRODUCT_ID, revision: 3 },
    });
    const outcome = await raiseToWarningAction({
      ...VALID,
      overrideReason: "  Radar shows a band over the island.  ",
    });
    expect(outcome).toEqual({ alertId: ALERT_ID, editable: true, ok: true });
    expect(mocks.getAlert).not.toHaveBeenCalled();
    expect(mocks.raiseEscalation).toHaveBeenCalledWith("token-abc", {
      awareness_level: "orange",
      override_reason: "Radar shows a band over the island.",
      product_id: PRODUCT_ID,
      revision: 3,
    });
  });

  it("sends a null reason when none was given", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.raiseEscalation.mockResolvedValue({
      alert_id: ALERT_ID,
      created: false,
      source: { kind: "flood", product_id: PRODUCT_ID, revision: 3 },
    });
    mocks.getAlert.mockResolvedValue(alertIn("DRAFT"));
    const outcome = await raiseToWarningAction({
      ...VALID,
      overrideReason: "   ",
    });
    expect(outcome).toEqual({ alertId: ALERT_ID, editable: true, ok: true });
    expect(mocks.raiseEscalation).toHaveBeenCalledWith(
      "token-abc",
      expect.objectContaining({ override_reason: null })
    );
  });

  it("opens the read view for an existing warning that is in force", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.raiseEscalation.mockResolvedValue({
      alert_id: ALERT_ID,
      created: false,
      source: { kind: "flood", product_id: PRODUCT_ID, revision: 3 },
    });
    mocks.getAlert.mockResolvedValue(alertIn("PUBLISHED"));
    const outcome = await raiseToWarningAction(VALID);
    expect(mocks.getAlert).toHaveBeenCalledWith("token-abc", ALERT_ID);
    expect(outcome).toEqual({ alertId: ALERT_ID, editable: false, ok: true });
  });

  it("opens the editor for an existing open draft", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.raiseEscalation.mockResolvedValue({
      alert_id: ALERT_ID,
      created: false,
      source: { kind: "flood", product_id: PRODUCT_ID, revision: 3 },
    });
    mocks.getAlert.mockResolvedValue(alertIn("SUBMITTED"));
    const outcome = await raiseToWarningAction(VALID);
    expect(outcome).toEqual({ alertId: ALERT_ID, editable: true, ok: true });
  });

  it("falls back to the read view and reports when the state cannot be read", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.raiseEscalation.mockResolvedValue({
      alert_id: ALERT_ID,
      created: false,
      source: { kind: "flood", product_id: PRODUCT_ID, revision: 3 },
    });
    mocks.getAlert.mockRejectedValue(new FakeAuthApiError(503, "down"));
    const outcome = await raiseToWarningAction(VALID);
    expect(outcome).toEqual({ alertId: ALERT_ID, editable: false, ok: true });
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(FakeAuthApiError),
      "cap-desk-escalations"
    );
  });

  it("lands on the read view when the state read fails with a non-auth error", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.raiseEscalation.mockResolvedValue({
      alert_id: ALERT_ID,
      created: false,
      source: { kind: "flood", product_id: PRODUCT_ID, revision: 3 },
    });
    const failure = new TypeError("fetch failed");
    mocks.getAlert.mockRejectedValue(failure);
    const outcome = await raiseToWarningAction(VALID);
    expect(outcome).toEqual({ alertId: ALERT_ID, editable: false, ok: true });
    expect(mocks.reportError).toHaveBeenCalledWith(
      failure,
      "cap-desk-escalations"
    );
  });

  it("shows the API's refusal, such as a missing reason", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.raiseEscalation.mockRejectedValue(
      new FakeAuthApiError(
        422,
        "The matrix suggests green for this likelihood and impact. To raise a orange warning, give the reason (at least 10 characters)."
      )
    );
    const outcome = await raiseToWarningAction(VALID);
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: "validation", status: 422 },
    });
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("reports a server failure and returns a plain message", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.raiseEscalation.mockRejectedValue(new FakeAuthApiError(503, "down"));
    const outcome = await raiseToWarningAction(VALID);
    expect(outcome).toMatchObject({ ok: false, error: { status: 503 } });
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(FakeAuthApiError),
      "cap-desk-escalations"
    );
  });

  it("lets an unexpected error reach error.tsx", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.raiseEscalation.mockRejectedValue(new TypeError("boom"));
    await expect(raiseToWarningAction(VALID)).rejects.toThrow("boom");
  });
});
