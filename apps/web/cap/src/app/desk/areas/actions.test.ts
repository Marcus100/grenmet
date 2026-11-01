import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ getDeskGate: vi.fn() }));
const writes = vi.hoisted(() => ({ createPredefinedArea: vi.fn() }));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/admin-writes", () => writes);
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@barrelsgd/auth", () => ({ isAuthApiError: () => false }));

import { savePredefinedArea } from "./actions";

const AREA = {
  area_desc: "St George",
  circles: [],
  geocodes: [],
  is_active: true,
  multipolygons: [],
  name: "St George parish",
  polygons: [],
};

beforeEach(() => {
  vi.clearAllMocks();
  gate.getDeskGate.mockResolvedValue(staffGate());
  writes.createPredefinedArea.mockResolvedValue({ id: "x", ...AREA });
});

describe("savePredefinedArea", () => {
  it("saves a valid area with the staff token", async () => {
    const result = await savePredefinedArea(AREA);
    expect(result.ok).toBe(true);
    expect(writes.createPredefinedArea).toHaveBeenCalledWith(
      "token-test",
      expect.objectContaining({ name: "St George parish" })
    );
  });

  it("refuses an area with no name, without calling the API", async () => {
    const result = await savePredefinedArea({ ...AREA, name: "" });
    expect(result.ok).toBe(false);
    expect(writes.createPredefinedArea).not.toHaveBeenCalled();
  });

  it("refuses a user without cap.settings.manage before FastAPI", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate({ settingsManage: false }));
    const result = await savePredefinedArea(AREA);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error.kind).toBe("not-allowed");
    expect(writes.createPredefinedArea).not.toHaveBeenCalled();
  });
});
