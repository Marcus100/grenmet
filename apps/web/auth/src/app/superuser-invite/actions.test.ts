import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  fetch: vi.fn(),
  write: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@barrelsgd/api-client", () => ({
  messageSchema: { parse: (value: unknown) => value },
  sessionLoginResponseSchema: { parse: (value: unknown) => value },
}));
vi.mock("@barrelsgd/auth/server", () => ({ authApiFetch: mocks.fetch }));
vi.mock("@/lib/auth-config", () => ({ getAuthConfig: () => ({}) }));
vi.mock("@/lib/report-error", () => ({ reportError: mocks.report }));
vi.mock("@/lib/session", () => ({
  writeSessionCookie: mocks.write,
  isAuthApiError: (error: unknown) =>
    typeof error === "object" && error !== null && "status" in error,
}));

import { superuserInviteAction } from "./actions";
import { INITIAL_INVITE_STATE, type InviteState } from "./invite-state";

const TOKEN = "t".repeat(40);
const SENT = "A new code was sent, if the invitation is still open.";
const SESSION = {
  session_token: "opaque-session-secret",
  session_expires_at: "2026-12-15T00:00:00Z",
};

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function apiError(status: number, detail = "x"): Error {
  return Object.assign(new Error("api"), { status, detail });
}

const SEND: InviteState = INITIAL_INVITE_STATE;
const CODE: InviteState = { ...INITIAL_INVITE_STATE, step: "code" };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("superuserInviteAction: send a code", () => {
  it("emails the code to the invited address and moves to the code step", async () => {
    mocks.fetch.mockResolvedValue({ message: "sent" });
    const state = await superuserInviteAction(
      SEND,
      form({ intent: "send", token: TOKEN })
    );
    expect(state).toEqual({
      error: null,
      needsTotp: false,
      notice: SENT,
      step: "code",
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.anything(),
      "/auth/superuser-invitations/code",
      expect.anything(),
      { body: { token: TOKEN }, method: "POST" }
    );
  });

  it("a failed new code keeps the current step and the authenticator state", async () => {
    mocks.fetch.mockRejectedValue(new Error("boom"));
    const state = await superuserInviteAction(
      { ...CODE, needsTotp: true },
      form({ intent: "send", token: TOKEN })
    );
    expect(state.step).toBe("code");
    expect(state.needsTotp).toBe(true);
    expect(state.error).toBe("We couldn't send a code. Try again in a moment.");
    expect(state.notice).toBeNull();
  });

  it("refuses a malformed link without calling the API", async () => {
    const state = await superuserInviteAction(
      SEND,
      form({ intent: "send", token: "short" })
    );
    expect(state.step).toBe("send");
    expect(state.error).toContain("not valid");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("explains a rate limit and keeps the step", async () => {
    mocks.fetch.mockRejectedValue(apiError(429));
    const state = await superuserInviteAction(
      SEND,
      form({ intent: "send", token: TOKEN })
    );
    expect(state.error).toContain("Too many attempts");
    expect(state.step).toBe("send");
  });

  it("reports an unexpected failure without showing details", async () => {
    mocks.fetch.mockRejectedValue(new Error("boom"));
    await superuserInviteAction(SEND, form({ intent: "send", token: TOKEN }));
    expect(mocks.report).toHaveBeenCalledOnce();
  });
});

describe("superuserInviteAction: accept", () => {
  it("opens the session with the emailed code and shows the next step", async () => {
    mocks.fetch.mockResolvedValue(SESSION);
    const state = await superuserInviteAction(
      CODE,
      form({ intent: "accept", token: TOKEN, code: "424242" })
    );
    expect(state).toEqual({
      error: null,
      needsTotp: false,
      notice: null,
      step: "done",
    });
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.anything(),
      "/auth/superuser-invitations/accept",
      expect.anything(),
      {
        body: { token: TOKEN, code: "424242", totp_code: null },
        method: "POST",
      }
    );
    expect(mocks.write).toHaveBeenCalledWith(
      SESSION.session_token,
      SESSION.session_expires_at
    );
  });

  it("asks for the authenticator code when the account has one", async () => {
    mocks.fetch.mockRejectedValue(
      apiError(400, "Two-factor authentication code required or invalid")
    );
    const state = await superuserInviteAction(
      CODE,
      form({ intent: "accept", token: TOKEN, code: "424242" })
    );
    expect(state.needsTotp).toBe(true);
    expect(state.step).toBe("code");
    expect(state.error).toContain("authenticator app");
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("sends an authenticator or recovery code with the emailed code", async () => {
    mocks.fetch.mockResolvedValue(SESSION);
    const state = await superuserInviteAction(
      { ...CODE, needsTotp: true },
      form({
        intent: "accept",
        token: TOKEN,
        code: "424242",
        totp_code: "abcd-ef12-3456",
      })
    );
    expect(state.step).toBe("done");
    expect(mocks.fetch).toHaveBeenCalledWith(
      expect.anything(),
      "/auth/superuser-invitations/accept",
      expect.anything(),
      {
        body: { token: TOKEN, code: "424242", totp_code: "abcd-ef12-3456" },
        method: "POST",
      }
    );
  });

  it("caps the authenticator field before calling the API", async () => {
    const state = await superuserInviteAction(
      { ...CODE, needsTotp: true },
      form({
        intent: "accept",
        token: TOKEN,
        code: "424242",
        totp_code: "x".repeat(65),
      })
    );
    expect(state.error).toContain("too long");
    expect(state.needsTotp).toBe(true);
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("refuses a wrong or ended invitation with one generic message and writes no session", async () => {
    mocks.fetch.mockRejectedValue(
      apiError(400, "That code is wrong or has expired. Request a new one.")
    );
    const state = await superuserInviteAction(
      CODE,
      form({ intent: "accept", token: TOKEN, code: "000000" })
    );
    expect(state.step).toBe("code");
    expect(state.needsTotp).toBe(false);
    expect(state.error).toContain("didn't work");
    expect(mocks.write).not.toHaveBeenCalled();
  });

  it("rejects a code that is not six digits before calling the API", async () => {
    const state = await superuserInviteAction(
      CODE,
      form({ intent: "accept", token: TOKEN, code: "12ab" })
    );
    expect(state.error).toBe("Enter the six-digit code we emailed you.");
    expect(mocks.fetch).not.toHaveBeenCalled();
  });

  it("does not report the token or the code when the service is down", async () => {
    mocks.fetch.mockRejectedValue(apiError(503));
    const state = await superuserInviteAction(
      CODE,
      form({ intent: "accept", token: TOKEN, code: "424242" })
    );
    expect(state.error).toContain("unavailable");
    for (const call of mocks.report.mock.calls) {
      expect(JSON.stringify(call)).not.toContain(TOKEN);
      expect(JSON.stringify(call)).not.toContain("424242");
    }
  });
});
