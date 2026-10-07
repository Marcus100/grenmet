import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const authApiFetch = vi.hoisted(() => vi.fn());
const revalidatePath = vi.hoisted(() => vi.fn());
const session = vi.hoisted(() => ({
  readSessionCookie: vi.fn(),
  exchangeSessionForAccessToken: vi.fn(),
}));
vi.mock("@barrelsgd/auth/server", () => ({ authApiFetch }));
vi.mock("next/cache", () => ({ revalidatePath }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));
vi.mock("@/lib/auth-config", () => ({ getAuthConfig: () => ({}) }));
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()),
  ...session,
}));

import { requestStaffAccessAction } from "./actions";

afterEach(() => vi.resetAllMocks());

describe("requestStaffAccessAction", () => {
  it("asks the API with the account's own token", async () => {
    session.readSessionCookie.mockResolvedValue("account-session");
    session.exchangeSessionForAccessToken.mockResolvedValue({
      access_token: "token",
    });
    authApiFetch.mockResolvedValue({});
    await requestStaffAccessAction();
    expect(authApiFetch.mock.calls[0]?.[1]).toBe(
      "/auth/users/me/staff-access-request"
    );
    expect(authApiFetch.mock.calls[0]?.[3]).toEqual({
      accessToken: "token",
      method: "POST",
    });
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("sends signed-out visitors to sign in", async () => {
    session.readSessionCookie.mockResolvedValue(null);
    let target = "";
    try {
      await requestStaffAccessAction();
    } catch (error) {
      target = (error as Error).message;
    }
    expect(target).toBe("redirect:/");
    expect(authApiFetch).not.toHaveBeenCalled();
  });
});
