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
    importAlert: vi.fn(),
    reportError: vi.fn(),
  };
});

vi.mock("@barrelsgd/auth", () => ({
  isAuthApiError: (error: unknown) => error instanceof mocks.FakeAuthApiError,
}));
vi.mock("@/lib/desk/gate", () => ({ getDeskGate: mocks.getDeskGate }));
vi.mock("@/lib/desk/api", () => ({ importAlert: mocks.importAlert }));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.reportError }));

import { importAlertAction } from "./actions";

const { FakeAuthApiError } = mocks;
const ID = "11111111-2222-4333-8444-555555555555";
const GOOD = { reviewed: true, source: "xml", value: "<alert/>" } as const;

const STAFF = {
  accessToken: "token-abc",
  email: "forecaster@example.org",
  name: "Forecaster",
  permissions: { create: true, read: true } as never,
  status: "staff",
  userId: "u1",
};

describe("importAlertAction", () => {
  beforeEach(() => {
    mocks.getDeskGate.mockReset();
    mocks.importAlert.mockReset();
    mocks.reportError.mockReset();
  });

  it("asks for sign-in when the session has ended and does not import", async () => {
    mocks.getDeskGate.mockResolvedValue({ status: "signed-out" });
    const outcome = await importAlertAction(GOOD);
    expect(outcome).toMatchObject({ ok: false, error: { kind: "session" } });
    expect(mocks.importAlert).not.toHaveBeenCalled();
  });

  it("refuses a signed-in account without create permission", async () => {
    mocks.getDeskGate.mockResolvedValue({
      ...STAFF,
      permissions: { create: false, read: true },
    });
    const outcome = await importAlertAction(GOOD);
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: "not-allowed" },
    });
    expect(mocks.importAlert).not.toHaveBeenCalled();
  });

  it("refuses an account that is staff but not refused by the gate", async () => {
    mocks.getDeskGate.mockResolvedValue({
      email: "x@example.org",
      status: "refused",
    });
    const outcome = await importAlertAction(GOOD);
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: "not-allowed" },
    });
    expect(mocks.importAlert).not.toHaveBeenCalled();
  });

  it("rejects an unconfirmed import before any network call", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    const outcome = await importAlertAction({ ...GOOD, reviewed: false });
    expect(outcome).toMatchObject({ ok: false, error: { kind: "validation" } });
    expect(mocks.importAlert).not.toHaveBeenCalled();
  });

  it("sends only the validated fields with the staff token", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.importAlert.mockResolvedValue({ id: ID, schema_conformant: true });
    const outcome = await importAlertAction({
      ...GOOD,
      extra: "dropped",
      value: "  <alert/>  ",
    });
    expect(mocks.importAlert).toHaveBeenCalledWith("token-abc", {
      source: "xml",
      value: "<alert/>",
    });
    expect(outcome).toEqual({
      alertId: ID,
      ok: true,
      schemaConformant: true,
      schemaProblems: [],
    });
  });

  it("returns a non-conformant import with its problems, not an error", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.importAlert.mockResolvedValue({
      id: ID,
      schema_conformant: false,
      schema_error: "line 4: bad sent",
    });
    const outcome = await importAlertAction(GOOD);
    expect(outcome).toMatchObject({
      ok: true,
      schemaConformant: false,
      schemaProblems: ["line 4: bad sent"],
    });
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("shows a refused document plainly and does not report it", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.importAlert.mockRejectedValue(
      new FakeAuthApiError(400, "CAP import failed: malformed XML")
    );
    const outcome = await importAlertAction(GOOD);
    expect(outcome).toMatchObject({
      ok: false,
      error: { items: ["malformed XML"], kind: "validation" },
    });
    expect(mocks.reportError).not.toHaveBeenCalled();
  });

  it("reports a server failure and shows that the service did not answer", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.importAlert.mockRejectedValue(
      new FakeAuthApiError(502, "bad gateway")
    );
    const outcome = await importAlertAction(GOOD);
    expect(outcome).toMatchObject({
      ok: false,
      error: { kind: "unavailable" },
    });
    expect(mocks.reportError).toHaveBeenCalledWith(
      expect.any(FakeAuthApiError),
      "cap-desk-import"
    );
  });

  it("lets an unexpected failure throw to error.tsx", async () => {
    mocks.getDeskGate.mockResolvedValue(STAFF);
    mocks.importAlert.mockRejectedValue(new TypeError("fetch failed"));
    await expect(importAlertAction(GOOD)).rejects.toThrow("fetch failed");
  });
});
