import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ getDeskGate: vi.fn() }));
const writes = vi.hoisted(() => ({ duplicateCapAlert: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/admin-writes", () => writes);
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@barrelsgd/auth", () => ({ isAuthApiError: () => false }));

import { duplicateAlertAsDraft } from "./duplicate-action";

const ALERT = "11111111-2222-4333-8444-555555555555";

beforeEach(() => {
  vi.clearAllMocks();
  gate.getDeskGate.mockResolvedValue(staffGate());
  writes.duplicateCapAlert.mockResolvedValue({
    id: "99999999-2222-4333-8444-555555555555",
  });
});

describe("duplicateAlertAsDraft", () => {
  it("copies a validated alert and returns the new draft", async () => {
    const result = await duplicateAlertAsDraft(ALERT);
    expect(result.ok).toBe(true);
    expect(writes.duplicateCapAlert).toHaveBeenCalledWith("token-test", ALERT);
  });

  it("refuses an alert id that is not a full UUID, without calling the API", async () => {
    for (const bad of [`${ALERT}/..`, "..%2f", "short"]) {
      const result = await duplicateAlertAsDraft(bad);
      expect(result.ok).toBe(false);
    }
    expect(writes.duplicateCapAlert).not.toHaveBeenCalled();
  });

  it("refuses a user without cap.alert.create before FastAPI", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate({ create: false }));
    const result = await duplicateAlertAsDraft(ALERT);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not-allowed");
    expect(writes.duplicateCapAlert).not.toHaveBeenCalled();
  });
});
