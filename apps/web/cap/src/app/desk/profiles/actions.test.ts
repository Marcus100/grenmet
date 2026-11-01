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
    approveHazardProfile: vi.fn(),
    getDeskGate: vi.fn(),
    reportError: vi.fn(),
  };
});

vi.mock("@barrelsgd/auth", () => ({
  isAuthApiError: (error: unknown) => error instanceof mocks.FakeAuthApiError,
}));
vi.mock("@/lib/desk/gate", () => ({ getDeskGate: mocks.getDeskGate }));
vi.mock("@/lib/desk/api", () => ({
  approveHazardProfile: mocks.approveHazardProfile,
}));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.reportError }));

import { approveHazardProfileAction } from "./actions";

const { FakeAuthApiError } = mocks;
const PROFILE_ID = "11111111-2222-4333-8444-555555555555";
const STAFF = {
  accessToken: "token-abc",
  email: "reviewer@example.org",
  name: "Reviewer",
  permissions: { approve: true, libraryManage: true } as never,
  status: "staff",
  userId: "u2",
};

describe("approveHazardProfileAction", () => {
  beforeEach(() => {
    mocks.getDeskGate.mockReset();
    mocks.approveHazardProfile.mockReset();
    mocks.reportError.mockReset();
  });

  it("asks for sign-in when the session has ended", async () => {
    mocks.getDeskGate.mockResolvedValue({ status: "signed-out" });
    const outcome = await approveHazardProfileAction({ profileId: PROFILE_ID });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "session" } });
    expect(mocks.approveHazardProfile).not.toHaveBeenCalled();
  });

  it("refuses without library or approval access, with no call", async () => {
    mocks.getDeskGate.mockResolvedValue({
      ...STAFF,
      permissions: { approve: true, libraryManage: false },
    });
    const outcome = await approveHazardProfileAction({ profileId: PROFILE_ID });
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: "not-allowed" },
    });
    expect(mocks.approveHazardProfile).not.toHaveBeenCalled();
  });

  it("rejects a malformed id before any call", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    const outcome = await approveHazardProfileAction({ profileId: "../x" });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "state" } });
    expect(mocks.approveHazardProfile).not.toHaveBeenCalled();
  });

  it("approves with the staff token and returns the profile", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    const profile = { id: PROFILE_ID, state: "APPROVED" };
    mocks.approveHazardProfile.mockResolvedValue(profile);
    const outcome = await approveHazardProfileAction({ profileId: PROFILE_ID });
    expect(mocks.approveHazardProfile).toHaveBeenCalledWith(
      "token-abc",
      PROFILE_ID
    );
    expect(outcome).toEqual({ ok: true, profile });
  });

  it("shows the reviewer refusal from the API as a plain state error", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.approveHazardProfile.mockRejectedValue(
      new FakeAuthApiError(409, "A profile's author cannot approve it.")
    );
    const outcome = await approveHazardProfileAction({ profileId: PROFILE_ID });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "state" } });
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("reports a server failure", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.approveHazardProfile.mockRejectedValue(
      new FakeAuthApiError(500, "boom")
    );
    const outcome = await approveHazardProfileAction({ profileId: PROFILE_ID });
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: "unavailable" },
    });
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(FakeAuthApiError),
      "cap-desk-profiles"
    );
  });

  it("lets an unexpected failure throw to error.tsx", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.approveHazardProfile.mockRejectedValue(new TypeError("network"));
    await expect(
      approveHazardProfileAction({ profileId: PROFILE_ID })
    ).rejects.toThrow("network");
  });
});
