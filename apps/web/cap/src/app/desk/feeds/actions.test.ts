import { beforeEach, describe, expect, it, vi } from "vitest";
import { staffGate } from "@/test/desk-gate.fixture";

const gate = vi.hoisted(() => ({ getDeskGate: vi.fn() }));
const writes = vi.hoisted(() => ({
  createCapFeed: vi.fn(),
  deleteCapFeed: vi.fn(),
  updateCapFeed: vi.fn(),
}));
vi.mock("@/lib/desk/gate", () => gate);
vi.mock("@/lib/desk/admin-writes", () => writes);
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@barrelsgd/auth", () => ({ isAuthApiError: () => false }));

import { createFeed, deleteFeed, updateFeed } from "./actions";

const FEED = "11111111-2222-4333-8444-555555555555";
const FEED_RECORD = {
  created_at: "2026-10-01T00:00:00Z",
  id: FEED,
  last_checked_at: null,
  last_error: null,
  name: "Partner",
  status: "ACTIVE",
  updated_at: "2026-10-01T00:00:00Z",
  url: "https://partner.example.test/cap.xml",
};

beforeEach(() => {
  vi.clearAllMocks();
  gate.getDeskGate.mockResolvedValue(staffGate());
  writes.createCapFeed.mockResolvedValue(FEED_RECORD);
  writes.updateCapFeed.mockResolvedValue(FEED_RECORD);
  writes.deleteCapFeed.mockResolvedValue(undefined);
});

describe("feed server actions", () => {
  it("creates a feed with a valid name and URL", async () => {
    const body = {
      name: "Partner",
      url: "https://partner.example.test/cap.xml",
    };
    const result = await createFeed(body);
    expect(result.ok).toBe(true);
    expect(writes.createCapFeed).toHaveBeenCalledWith("token-test", body);
  });

  it("refuses a create with no name, without calling the API", async () => {
    const result = await createFeed({
      name: "",
      url: "https://x.example.test",
    });
    expect(result.ok).toBe(false);
    expect(writes.createCapFeed).not.toHaveBeenCalled();
  });

  it("refuses a feed id that is not a full UUID (encoded dots, extra segments)", async () => {
    for (const bad of [`${FEED}/..`, "..%2f..", `${FEED}%2e`, "not-a-uuid"]) {
      const result = await updateFeed(bad, { name: "Renamed" });
      expect(result.ok).toBe(false);
    }
    expect(writes.updateCapFeed).not.toHaveBeenCalled();
    expect(writes.deleteCapFeed).not.toHaveBeenCalled();
  });

  it("updates by a validated lower-case id", async () => {
    const result = await updateFeed(FEED.toUpperCase(), { name: "Renamed" });
    expect(result.ok).toBe(true);
    expect(writes.updateCapFeed).toHaveBeenCalledWith("token-test", FEED, {
      name: "Renamed",
    });
  });

  it("deletes by a validated id", async () => {
    const result = await deleteFeed(FEED);
    expect(result).toEqual({ data: null, ok: true });
    expect(writes.deleteCapFeed).toHaveBeenCalledWith("token-test", FEED);
  });

  it("refuses every feed write without cap.feed.manage", async () => {
    gate.getDeskGate.mockResolvedValue(staffGate({ feedsManage: false }));
    const results = [
      await createFeed({ name: "A", url: "https://a.example.test" }),
      await updateFeed(FEED, { name: "A" }),
      await deleteFeed(FEED),
    ];
    for (const result of results) {
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.error.kind).toBe("not-allowed");
    }
    expect(writes.createCapFeed).not.toHaveBeenCalled();
    expect(writes.updateCapFeed).not.toHaveBeenCalled();
    expect(writes.deleteCapFeed).not.toHaveBeenCalled();
  });
});
