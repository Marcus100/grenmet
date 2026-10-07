import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const authApiFetch = vi.hoisted(() => vi.fn());
const writeSessionCookie = vi.hoisted(() => vi.fn());
vi.mock("@barrelsgd/auth/server", () => ({ authApiFetch }));
vi.mock("@/lib/auth-config", () => ({ getAuthConfig: () => ({}) }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/return-to", () => ({
  getSafeReturnTo: (value: string | null) =>
    value?.startsWith("/") ? value : null,
}));
vi.mock("@/lib/session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/session")>()),
  writeSessionCookie,
}));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
}));

import { AuthApiError } from "@barrelsgd/auth";
import { initialEmailCodeState } from "@/app/actions-types";
import { emailCodeAction } from "./actions";

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

async function outcome(promise: Promise<unknown>) {
  try {
    return await promise;
  } catch (error) {
    return (error as Error).message;
  }
}

afterEach(() => vi.resetAllMocks());

describe("emailCodeAction", () => {
  it("sends a code, then signs in and returns to where sign-in started", async () => {
    authApiFetch.mockResolvedValueOnce({ message: "sent" });
    const sent = await emailCodeAction(
      initialEmailCodeState,
      form({ email: "Kezia@Example.com" })
    );
    expect(sent).toEqual({
      email: "kezia@example.com",
      error: null,
      step: "code",
    });

    authApiFetch.mockResolvedValueOnce({
      session_token: "account-session",
      session_expires_at: "2030-01-01T00:00:00Z",
    });
    const result = await outcome(
      emailCodeAction(
        sent,
        form({
          email: "kezia@example.com",
          code: "123456",
          returnTo: "/continue?app=events&state=s",
        })
      )
    );
    expect(result).toBe("redirect:/continue?app=events&state=s");
    expect(writeSessionCookie).toHaveBeenCalledWith(
      "account-session",
      "2030-01-01T00:00:00Z"
    );
  });

  it("asks for the authenticator code when two-factor is on", async () => {
    authApiFetch.mockRejectedValueOnce(
      new AuthApiError(
        400,
        "Two-factor authentication code required or invalid"
      )
    );
    const result = await emailCodeAction(
      { email: "k@example.com", error: null, step: "code" },
      form({ email: "k@example.com", code: "123456" })
    );
    expect(result).toEqual({
      email: "k@example.com",
      error: null,
      step: "mfa",
    });
  });

  it("shows the API's reason for a wrong code", async () => {
    authApiFetch.mockRejectedValueOnce(
      new AuthApiError(400, "That code is wrong or has expired.")
    );
    const result = await emailCodeAction(
      { email: "k@example.com", error: null, step: "code" },
      form({ email: "k@example.com", code: "000000" })
    );
    expect(result.error).toBe("That code is wrong or has expired.");
    expect(writeSessionCookie).not.toHaveBeenCalled();
  });
});
