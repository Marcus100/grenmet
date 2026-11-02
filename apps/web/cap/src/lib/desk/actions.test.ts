import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ getDeskGate: vi.fn() }));
const report = vi.hoisted(() => ({ reportError: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/report-error", () => report);
vi.mock("@barrelsgd/auth", () => ({
  isAuthApiError: (error: unknown) =>
    error instanceof Error && error.name === "AuthApiError",
}));

import { runDeskAction } from "./actions";

function apiError(status: number, detail: unknown) {
  return Object.assign(new Error(String(detail)), {
    detail,
    name: "AuthApiError",
    status,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("runDeskAction", () => {
  it("asks the user to sign in and does not call the API when signed out", async () => {
    gate.getDeskGate.mockResolvedValue({ status: "signed-out" });
    const work = vi.fn();
    const result = await runDeskAction("settingsManage", work);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("session");
    expect(work).not.toHaveBeenCalled();
  });

  it("refuses without the permission and never calls the API", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate({ settingsManage: false }));
    const work = vi.fn();
    const result = await runDeskAction("settingsManage", work);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not-allowed");
    expect(work).not.toHaveBeenCalled();
  });

  it("returns the data with the staff token on success", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate());
    const work = vi.fn().mockResolvedValue({ saved: true });
    const result = await runDeskAction("settingsManage", work);
    expect(result).toEqual({ data: { saved: true }, ok: true });
    expect(work).toHaveBeenCalledWith("token-test");
  });

  it("turns an expected API refusal into a readable error without reporting it", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate());
    const result = await runDeskAction("settingsManage", () =>
      Promise.reject(apiError(422, "Sender is required."))
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      expect(result.error.items).toEqual(["Sender is required."]);
    }
    expect(report.reportError).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure and says the service did not answer", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate());
    const boom = new TypeError("socket closed");
    const result = await runDeskAction("settingsManage", () =>
      Promise.reject(boom)
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("unavailable");
    expect(report.reportError).toHaveBeenCalledWith(boom, "cap-desk-action");
  });
});
