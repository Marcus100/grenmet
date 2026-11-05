import { beforeEach, describe, expect, it, vi } from "vitest";

const { authApiFetch, readSessionCookie, reportError } = vi.hoisted(() => ({
  authApiFetch: vi.fn(),
  readSessionCookie: vi.fn(),
  reportError: vi.fn(),
}));

vi.mock("@barrelsgd/auth/server", () => ({ authApiFetch }));
vi.mock("@/lib/session", () => ({
  exchangeSessionForAccessToken: vi.fn().mockResolvedValue({
    access_token: "token",
  }),
  isAuthApiError: () => false,
  readSessionCookie,
}));
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/auth-config", () => ({ getAuthConfig: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

import { saveNameAction } from "@/app/actions";

const initial = { error: null, saved: false };

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  authApiFetch.mockReset();
  readSessionCookie.mockResolvedValue("session");
});

describe("saveNameAction", () => {
  it("asks for both names when one is missing and does not call the API", async () => {
    const result = await saveNameAction(
      initial,
      form({ first_name: "Jane", last_name: " " })
    );
    expect(result.error).toBe("Enter your first and last name, or skip this.");
    expect(authApiFetch).not.toHaveBeenCalled();
  });

  it("saves the names with a PATCH to the current user", async () => {
    authApiFetch.mockResolvedValue({});
    const result = await saveNameAction(
      initial,
      form({ first_name: "Jane", last_name: "Smith" })
    );
    expect(result).toEqual({ error: null, saved: true });
    expect(authApiFetch).toHaveBeenCalledWith(
      expect.anything(),
      "/auth/users/me",
      expect.anything(),
      expect.objectContaining({
        method: "PATCH",
        body: { first_name: "Jane", last_name: "Smith" },
      })
    );
  });

  it("reports an unexpected failure in plain words and logs it", async () => {
    authApiFetch.mockRejectedValue(new Error("boom"));
    const result = await saveNameAction(
      initial,
      form({ first_name: "Jane", last_name: "Smith" })
    );
    expect(result).toEqual({
      error: "Unable to save your name. Try again.",
      saved: false,
    });
    expect(reportError).toHaveBeenCalled();
  });
});
