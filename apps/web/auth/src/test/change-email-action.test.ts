import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  authApiFetch,
  clearSessionCookie,
  readSessionCookie,
  reportError,
  AuthApiError,
} = vi.hoisted(() => {
  class AuthApiError extends Error {
    detail: string;
    constructor(detail: string) {
      super(detail);
      this.detail = detail;
    }
  }
  return {
    authApiFetch: vi.fn(),
    clearSessionCookie: vi.fn().mockResolvedValue(undefined),
    readSessionCookie: vi.fn(),
    reportError: vi.fn(),
    AuthApiError,
  };
});

vi.mock("@barrelsgd/auth/server", () => ({ authApiFetch }));
vi.mock("@/lib/session", () => ({
  clearSessionCookie,
  exchangeSessionForAccessToken: vi.fn().mockResolvedValue({
    access_token: "token",
  }),
  isAuthApiError: (error: unknown) => error instanceof AuthApiError,
  readSessionCookie,
}));
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/auth-config", () => ({ getAuthConfig: () => ({}) }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// The real redirect throws; the test sees the target in the thrown message.
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  },
}));

import { changeEmailAction, sendEmailChangeCodeAction } from "@/app/actions";
import { initialEmailChangeState } from "@/app/actions-types";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(fields)) data.set(key, value);
  return data;
}

beforeEach(() => {
  authApiFetch.mockReset();
  clearSessionCookie.mockClear();
  reportError.mockClear();
  readSessionCookie.mockResolvedValue("session");
});

describe("changeEmailAction", () => {
  it("asks for the new address and does not call the API without one", async () => {
    const result = await changeEmailAction(
      initialEmailChangeState,
      form({ email: " ", current_password: "password123" })
    );
    expect(result.error).toBe("Enter your new email address.");
    expect(authApiFetch).not.toHaveBeenCalled();
  });

  it("asks for the current password or code before any change", async () => {
    const result = await changeEmailAction(
      initialEmailChangeState,
      form({ email: "new@example.com" })
    );
    expect(result.error).toBe(
      "Enter your current password to change your email address."
    );
    expect(authApiFetch).not.toHaveBeenCalled();
  });

  it("sends the password with the new address and signs the browser out", async () => {
    authApiFetch.mockResolvedValue({});
    await expect(
      changeEmailAction(
        initialEmailChangeState,
        form({ email: "new@example.com", current_password: "password123" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/?notice=email-changed");
    expect(authApiFetch).toHaveBeenCalledWith(
      expect.anything(),
      "/auth/users/me",
      expect.anything(),
      expect.objectContaining({
        method: "PATCH",
        body: { email: "new@example.com", current_password: "password123" },
      })
    );
    expect(clearSessionCookie).toHaveBeenCalled();
  });

  it("sends the emailed code instead of a password for a code-only account", async () => {
    authApiFetch.mockResolvedValue({});
    await expect(
      changeEmailAction(
        initialEmailChangeState,
        form({ email: "new@example.com", email_code: "123456" })
      )
    ).rejects.toThrow("NEXT_REDIRECT:/?notice=email-changed");
    expect(authApiFetch).toHaveBeenCalledWith(
      expect.anything(),
      "/auth/users/me",
      expect.anything(),
      expect.objectContaining({
        body: { email: "new@example.com", email_code: "123456" },
      })
    );
  });

  it("shows the reason after the stable proof code when the proof is missing", async () => {
    authApiFetch.mockRejectedValue(
      new AuthApiError(
        "email_change_proof_required: Enter your current password to change your email address."
      )
    );
    const result = await changeEmailAction(
      initialEmailChangeState,
      form({ email: "new@example.com", current_password: "x" })
    );
    expect(result).toEqual({
      error: "Enter your current password to change your email address.",
      codeSent: false,
    });
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });

  it("shows a wrong password in plain words and keeps the signed-in session", async () => {
    authApiFetch.mockRejectedValue(
      new AuthApiError("Your current password is not correct.")
    );
    const result = await changeEmailAction(
      initialEmailChangeState,
      form({ email: "new@example.com", current_password: "nope" })
    );
    expect(result.error).toBe("Your current password is not correct.");
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });

  it("reports an unexpected failure in plain words and logs it", async () => {
    authApiFetch.mockRejectedValue(new Error("boom"));
    const result = await changeEmailAction(
      initialEmailChangeState,
      form({ email: "new@example.com", current_password: "password123" })
    );
    expect(result).toEqual({
      error: "Unable to change your email. Try again.",
      codeSent: false,
    });
    expect(reportError).toHaveBeenCalled();
  });
});

describe("sendEmailChangeCodeAction", () => {
  it("asks the API to email a code to the current address", async () => {
    authApiFetch.mockResolvedValue({ message: "sent" });
    const result = await sendEmailChangeCodeAction();
    expect(result).toEqual({ error: null, codeSent: true });
    expect(authApiFetch).toHaveBeenCalledWith(
      expect.anything(),
      "/auth/users/me/email-change/code",
      expect.anything(),
      expect.objectContaining({ method: "POST" })
    );
  });

  it("shows the API's reason when a code was refused, such as a rate limit", async () => {
    authApiFetch.mockRejectedValue(
      new AuthApiError("Wait a minute before asking for another code.")
    );
    const result = await sendEmailChangeCodeAction();
    expect(result).toEqual({
      error: "Wait a minute before asking for another code.",
      codeSent: false,
    });
  });
});
