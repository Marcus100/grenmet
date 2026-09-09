import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  cookie: vi.fn(),
  exchange: vi.fn(),
  write: vi.fn(),
  list: vi.fn(),
  history: vi.fn(),
}));
vi.mock("@/lib/server-session", () => ({
  authApiFetch: mocks.access,
  readSessionCookie: mocks.cookie,
  exchangeSessionForAccessToken: mocks.exchange,
}));
vi.mock("@/db/wxproducts/authored-queries", () => ({
  writeAuthoredProduct: mocks.write,
  listAuthoredProducts: mocks.list,
  getProductHistory: mocks.history,
  RevisionConflict: class extends Error {},
}));

import { loadProductsAction, saveProductAction } from "./product-actions";

const input = {
  id: "7d517fe0-a25b-4f12-a2b4-eaaed8116010",
  expectedRevision: 0,
  kind: "marine",
  values: {},
  action: "draft",
  changeSummary: "",
  reviewed: false,
};
beforeEach(() => {
  vi.resetAllMocks();
  mocks.cookie.mockResolvedValue("session");
  mocks.access.mockResolvedValue({ allowed_kinds: ["marine"] });
  mocks.exchange.mockResolvedValue({
    user: {
      id: "staff-id",
      full_name: "Duty Forecaster",
      email: "staff@example.test",
      is_active: true,
    },
  });
  mocks.write.mockResolvedValue({ revision: 1 });
});
describe("product actions", () => {
  it("does not trust the presence of a cookie", async () => {
    mocks.exchange.mockRejectedValue(new Error("revoked"));
    expect((await saveProductAction(input)).ok).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("blocks inactive users and anonymous reads", async () => {
    mocks.exchange.mockResolvedValue({ user: { is_active: false } });
    expect((await saveProductAction(input)).ok).toBe(false);
    mocks.cookie.mockResolvedValue(null);
    expect((await loadProductsAction("marine", "2026-09-08")).ok).toBe(false);
    expect(mocks.list).not.toHaveBeenCalled();
  });
  it("rejects active accounts without product-author access", async () => {
    mocks.access.mockResolvedValue({ allowed_kinds: [] });
    mocks.exchange.mockResolvedValue({
      user: { id: "unrelated-user", is_active: true, is_superuser: false },
    });
    expect((await saveProductAction(input)).ok).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
  });
  it("records the verified actor, not client supplied identity", async () => {
    expect((await saveProductAction({ ...input, actorId: "forged" })).ok).toBe(
      true
    );
    expect(mocks.write).toHaveBeenCalledWith(
      expect.not.objectContaining({ actorId: "forged" }),
      { id: "staff-id", name: "Duty Forecaster" }
    );
  });
  it("cannot publish an incomplete draft by bypassing the form", async () => {
    expect(
      (await saveProductAction({ ...input, action: "publish", reviewed: true }))
        .ok
    ).toBe(false);
    expect(mocks.write).not.toHaveBeenCalled();
  });
});

it("checks the selected product against live grade policy", async () => {
  expect((await saveProductAction({ ...input, kind: "morning" })).ok).toBe(
    false
  );
  expect(mocks.write).not.toHaveBeenCalled();
  expect(mocks.access).toHaveBeenCalledWith("/hr/product-access/me", {
    cache: "no-store",
  });
});
it("fails closed when the policy API is unavailable", async () => {
  mocks.access.mockRejectedValue(new Error("unavailable"));
  expect((await saveProductAction(input)).ok).toBe(false);
  expect(mocks.write).not.toHaveBeenCalled();
});
