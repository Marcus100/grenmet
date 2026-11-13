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
    getDeskGate: vi.fn(),
    reportError: vi.fn(),
    suggestIbf: vi.fn(),
  };
});

vi.mock("@barrelsgd/auth", () => ({
  isAuthApiError: (error: unknown) => error instanceof mocks.FakeAuthApiError,
}));
vi.mock("@/lib/desk/gate", () => ({ getDeskGate: mocks.getDeskGate }));
vi.mock("@/lib/desk/api", () => ({ suggestIbf: mocks.suggestIbf }));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.reportError }));

import { suggestIbfAction } from "./actions";

const { FakeAuthApiError } = mocks;
const GOOD = { impact: "Severe", kind: "flood", likelihood: "High" };
const STAFF = {
  accessToken: "token-abc",
  email: "f@example.org",
  name: "F",
  permissions: { read: true } as never,
  status: "staff",
  userId: "u1",
};

describe("suggestIbfAction", () => {
  beforeEach(() => {
    mocks.getDeskGate.mockReset();
    mocks.suggestIbf.mockReset();
    mocks.reportError.mockReset();
  });

  it("asks for sign-in when the session has ended", async () => {
    mocks.getDeskGate.mockResolvedValue({ status: "signed-out" });
    expect(await suggestIbfAction(GOOD)).toMatchObject({
      ok: false,
      error: { kind: "session" },
    });
    expect(mocks.suggestIbf).not.toHaveBeenCalled();
  });

  it("refuses a refused account with no call", async () => {
    mocks.getDeskGate.mockResolvedValue({ email: "x", status: "refused" });
    expect(await suggestIbfAction(GOOD)).toMatchObject({
      ok: false,
      error: { kind: "not-allowed" },
    });
    expect(mocks.suggestIbf).not.toHaveBeenCalled();
  });

  it("rejects bad input before any call", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    expect(await suggestIbfAction({ ...GOOD, kind: "../x" })).toMatchObject({
      ok: false,
      error: { kind: "validation" },
    });
    expect(mocks.suggestIbf).not.toHaveBeenCalled();
  });

  it("returns the advice with the staff token and changes nothing", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    const suggestion = { available: true, colour: "red" };
    mocks.suggestIbf.mockResolvedValue(suggestion);
    expect(await suggestIbfAction(GOOD)).toEqual({ ok: true, suggestion });
    expect(mocks.suggestIbf).toHaveBeenCalledWith("token-abc", GOOD);
  });

  it("reports a server failure and shows that the service did not answer", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.suggestIbf.mockRejectedValue(new FakeAuthApiError(500, "boom"));
    expect(await suggestIbfAction(GOOD)).toMatchObject({
      ok: false,
      error: { kind: "unavailable" },
    });
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(FakeAuthApiError),
      "cap-desk-matrix"
    );
  });

  it("lets an unexpected failure throw to error.tsx", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.suggestIbf.mockRejectedValue(new TypeError("network"));
    await expect(suggestIbfAction(GOOD)).rejects.toThrow("network");
  });
});
