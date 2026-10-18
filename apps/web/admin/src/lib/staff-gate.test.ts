import { AuthApiError } from "@barrelsgd/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readSessionCookie = vi.fn();
const exchangeSessionForAccessToken = vi.fn();

vi.mock("@barrelsgd/auth/server", () => ({
  readSessionCookie: (...args: unknown[]) => readSessionCookie(...args),
  exchangeSessionForAccessToken: (...args: unknown[]) =>
    exchangeSessionForAccessToken(...args),
}));

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    throw new Error(`redirect:${path}`);
  },
}));

const { decideGate, getStaffGate, requireGate } = await import(
  "@/lib/staff-gate"
);

const staffer = {
  email: "owner@barrels.gd",
  full_name: "Owner",
  is_active: true,
  is_superuser: true,
};

describe("decideGate", () => {
  it("admits an active superuser with their access token", () => {
    expect(decideGate(staffer, "token")).toEqual({
      status: "staff",
      accessToken: "token",
      email: "owner@barrels.gd",
      name: "Owner",
    });
  });

  it("refuses an approved account that is not a superuser", () => {
    expect(decideGate({ ...staffer, is_superuser: false }, "token")).toEqual({
      status: "refused",
      email: "owner@barrels.gd",
    });
  });

  it("refuses an inactive superuser", () => {
    expect(decideGate({ ...staffer, is_active: false }, "token").status).toBe(
      "refused"
    );
  });
});

describe("getStaffGate", () => {
  beforeEach(() => {
    readSessionCookie.mockReset();
    exchangeSessionForAccessToken.mockReset();
  });

  it("is signed out without a cookie and never calls the API", async () => {
    readSessionCookie.mockResolvedValue(null);
    expect(await getStaffGate()).toEqual({ status: "signed-out" });
    expect(exchangeSessionForAccessToken).not.toHaveBeenCalled();
  });

  it("lets a superuser session through", async () => {
    readSessionCookie.mockResolvedValue("session");
    exchangeSessionForAccessToken.mockResolvedValue({
      access_token: "jwt",
      user: staffer,
    });
    const gate = await getStaffGate();
    expect(gate.status).toBe("staff");
  });

  it("refuses a non-superuser session", async () => {
    readSessionCookie.mockResolvedValue("session");
    exchangeSessionForAccessToken.mockResolvedValue({
      access_token: "jwt",
      user: { ...staffer, is_superuser: false },
    });
    expect((await getStaffGate()).status).toBe("refused");
  });

  it.each([401, 403])("treats API status %i as signed out", async (status) => {
    readSessionCookie.mockResolvedValue("session");
    exchangeSessionForAccessToken.mockRejectedValue(
      new AuthApiError(status, "nope")
    );
    expect(await getStaffGate()).toEqual({ status: "signed-out" });
  });

  it("lets an outage reach the error boundary", async () => {
    readSessionCookie.mockResolvedValue("session");
    exchangeSessionForAccessToken.mockRejectedValue(
      new AuthApiError(502, "bad gateway")
    );
    await expect(getStaffGate()).rejects.toThrow("bad gateway");
  });
});

describe("requireGate", () => {
  it("sends signed-out visitors to sign in with a return path", async () => {
    readSessionCookie.mockResolvedValue(null);
    await expect(requireGate("/organisations")).rejects.toThrow(
      "redirect:/signin?returnTo=%2Forganisations"
    );
  });
});
