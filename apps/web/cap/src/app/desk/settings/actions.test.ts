import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ getDeskGate: vi.fn() }));
const writes = vi.hoisted(() => ({ patchCapSettings: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/admin-writes", () => writes);
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@barrelsgd/auth", () => ({ isAuthApiError: () => false }));

import { saveCapSettings } from "./actions";

const FEED_LIMIT = /feed_limit/;

const VALID = {
  contact: "gms@example.test",
  feed_limit: 50,
  sender: "gms.gd",
  sender_name: "Grenada Meteorological Service",
  signing_certificate_ref: null,
  signing_enabled: false,
  web: "https://gms.example.test",
  wmo_oid: null,
};

beforeEach(() => {
  vi.clearAllMocks();
  gate.getDeskGate.mockResolvedValue(staffGate());
});

describe("saveCapSettings", () => {
  it("sends a valid update with the staff token", async () => {
    writes.patchCapSettings.mockResolvedValue({ sender: "gms.gd" });
    const result = await saveCapSettings(VALID);
    expect(result.ok).toBe(true);
    expect(writes.patchCapSettings).toHaveBeenCalledWith("token-test", VALID);
  });

  it("rejects input that the schema refuses without calling the API", async () => {
    const result = await saveCapSettings({ ...VALID, feed_limit: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("validation");
      expect(result.error.items.join(" ")).toMatch(FEED_LIMIT);
    }
    expect(writes.patchCapSettings).not.toHaveBeenCalled();
  });

  it("refuses a user without cap.settings.manage before touching FastAPI", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate({ settingsManage: false }));
    const result = await saveCapSettings(VALID);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not-allowed");
    expect(writes.patchCapSettings).not.toHaveBeenCalled();
  });
});
