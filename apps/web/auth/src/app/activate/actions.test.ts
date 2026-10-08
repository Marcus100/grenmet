import { beforeEach, expect, it, vi } from "vitest";

const confirm = vi.hoisted(() => vi.fn());
vi.mock("@/lib/modern-auth", () => ({ confirmActivation: confirm }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/session", () => ({ isAuthApiError: () => false }));

import { activateAccount } from "./actions";

const initial = { message: "", done: false };
function form(password = "long-password-123", confirmation = password) {
  const data = new FormData();
  data.set("token", "a".repeat(64));
  data.set("password", password);
  data.set("confirm", confirmation);
  return data;
}
beforeEach(() => {
  confirm.mockClear();
});
it("proxies valid activation to the API", async () => {
  confirm.mockResolvedValue({ message: "Account activated" });
  expect(await activateAccount(initial, form())).toEqual({
    message: "Account activated",
    done: true,
  });
  expect(confirm).toHaveBeenCalledWith({
    token: "a".repeat(64),
    new_password: "long-password-123",
  });
});
it("does not send mismatched or short passwords", async () => {
  expect(
    (await activateAccount(initial, form("long-password-123", "different")))
      .done
  ).toBe(false);
  expect((await activateAccount(initial, form("short"))).done).toBe(false);
  expect(confirm).not.toHaveBeenCalled();
});
it("keeps the form available when the API rejects activation", async () => {
  confirm.mockRejectedValue(new Error("Unavailable"));
  expect((await activateAccount(initial, form())).done).toBe(false);
});
