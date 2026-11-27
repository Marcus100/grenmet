import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const authApiFetch = vi.hoisted(() => vi.fn());
const writeSessionCookie = vi.hoisted(() => vi.fn());
vi.mock("@barrelsgd/auth/server", () => ({ authApiFetch }));
vi.mock("@/lib/auth-config", () => ({ getAuthConfig: () => ({}) }));
const reportError = vi.hoisted(() => vi.fn());
vi.mock("@/lib/report-error", () => ({ reportError }));
const rememberJoinIntent = vi.hoisted(() => vi.fn());
vi.mock("@/lib/join-intent", () => ({ rememberJoinIntent }));
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
      resendAfterSeconds: 60,
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
    // The sign-in was for an app: leave the mark /continue needs to join it
    // without a second question, bound to the new session.
    expect(rememberJoinIntent).toHaveBeenCalledWith(
      "/continue?app=events&state=s",
      "account-session"
    );
  });

  it("still signs in when the join mark cannot be written", async () => {
    authApiFetch.mockResolvedValueOnce({
      session_token: "account-session",
      session_expires_at: "2030-01-01T00:00:00Z",
    });
    const failure = new Error("cookie jar unavailable");
    rememberJoinIntent.mockRejectedValueOnce(failure);
    const result = await outcome(
      emailCodeAction(
        { email: "k@example.com", error: null, step: "code" },
        form({
          email: "k@example.com",
          code: "123456",
          returnTo: "/continue?app=events&state=s",
        })
      )
    );
    expect(result).toBe("redirect:/continue?app=events&state=s");
    expect(writeSessionCookie).toHaveBeenCalledTimes(1);
    // Reported under its own area, with the error only (no address, no code).
    expect(reportError).toHaveBeenCalledTimes(1);
    expect(reportError).toHaveBeenCalledWith(failure, "auth-join-intent");
  });

  it("answers a code request the same way for every address", async () => {
    // The API's reply never says whether an account exists; nor does this one.
    authApiFetch.mockResolvedValue({ message: "sent" });
    const known = await emailCodeAction(
      initialEmailCodeState,
      form({ email: "known@example.com" })
    );
    const unknown = await emailCodeAction(
      initialEmailCodeState,
      form({ email: "new@example.com" })
    );
    expect({ ...known, email: "" }).toEqual({ ...unknown, email: "" });
    expect(rememberJoinIntent).not.toHaveBeenCalled();
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
    expect(rememberJoinIntent).not.toHaveBeenCalled();
  });

  it("passes the Turnstile token with the code request", async () => {
    authApiFetch.mockResolvedValueOnce({ message: "sent" });
    await emailCodeAction(
      initialEmailCodeState,
      form({ email: "k@example.com", turnstile_token: "tok-1" })
    );
    expect(authApiFetch).toHaveBeenCalledWith(
      {},
      "/auth/email-code/start",
      expect.anything(),
      {
        body: { email: "k@example.com", turnstile_token: "tok-1" },
        method: "POST",
      }
    );
  });

  it("sends no token field when the page has no widget", async () => {
    authApiFetch.mockResolvedValueOnce({ message: "sent" });
    await emailCodeAction(
      initialEmailCodeState,
      form({ email: "k@example.com" })
    );
    expect(authApiFetch.mock.calls[0]?.[3]).toEqual({
      body: { email: "k@example.com" },
      method: "POST",
    });
  });

  it("asks for the check again when the API refuses the token", async () => {
    authApiFetch.mockRejectedValueOnce(
      new AuthApiError(400, "Verification failed")
    );
    const result = await emailCodeAction(
      initialEmailCodeState,
      form({ email: "k@example.com", turnstile_token: "stale" })
    );
    expect(result).toEqual({
      email: "k@example.com",
      error: "We couldn't confirm this request came from a person. Try again.",
      step: "email",
    });
  });
});
