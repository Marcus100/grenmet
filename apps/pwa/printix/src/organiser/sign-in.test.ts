// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ENROLMENT_REQUIRED_CODE,
  type Problem,
  problemMessage,
  problemOf,
} from "@/organiser/errors";
import { OrganiserSession, SESSION_STORAGE_KEY } from "@/organiser/session";
import { requestEmailCode, verifySignIn } from "@/organiser/sign-in";
import { json, loginBody, ORIGIN, routeFetch } from "@/test/organiser-fetch";

const START = "POST /api/v1/auth/apps/printix/email-code/start";
const VERIFY = "POST /api/v1/auth/apps/printix/email-code/verify";
const EMAIL = "organiser@example.test";

/** Codes and jargon the screens must never show a person. */
const INTERNAL_WORDS = /mfa_|_|\bOTP\b|\bAPI\b/u;

function newSession(): OrganiserSession {
  return new OrganiserSession({
    origin: ORIGIN,
    storage: window.sessionStorage,
  });
}

/** A 400/403/429 answer with the API's error envelope. */
function apiError(status: number, body: unknown, headers?: HeadersInit) {
  return json(status, body, headers);
}

/** A fake of the API client's ResponseError, for mapping tests that need no fetch. */
function responseError(
  status: number,
  data: unknown,
  headers?: Record<string, string>
): Error {
  const error = new Error(`HTTP ${status}`) as Error & {
    status: number;
    data: unknown;
    response: Response;
  };
  error.name = "ResponseError";
  error.status = status;
  error.data = data;
  error.response = new Response(null, { status, headers });
  return error;
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.localStorage.clear();
});

describe("problemOf: sign-in answers", () => {
  it("reads a wrong authenticator code from the two-factor message", () => {
    expect(
      problemOf(
        responseError(400, {
          detail: "Two-factor authentication code required or invalid",
        })
      )
    ).toEqual({ kind: "authenticator-wrong" });
  });

  it("reads a wrong or expired emailed code", () => {
    expect(
      problemOf(
        responseError(400, {
          detail: "That code is wrong or has expired. Request a new one.",
        })
      )
    ).toEqual({ kind: "email-code-wrong" });
  });

  it("says the account is not set up for Printix when the team has not given access", () => {
    expect(
      problemOf(
        responseError(403, {
          detail: "Ask the team to give you access to this app.",
        })
      )
    ).toEqual({ kind: "not-set-up" });
    expect(
      problemOf(
        responseError(403, {
          detail: "This account can't sign in to this app.",
        })
      )
    ).toEqual({ kind: "not-set-up" });
  });

  it("asks for an authenticator when none is enrolled (the stable enrolment code)", () => {
    expect(
      problemOf(
        responseError(403, {
          detail: `Set up two-step verification first (${ENROLMENT_REQUIRED_CODE})`,
        })
      )
    ).toEqual({ kind: "no-authenticator" });
  });

  it("gives rate limiting its own message, with the server's wait", () => {
    expect(
      problemOf(
        responseError(429, { error: "slow down" }, { "Retry-After": "120" })
      )
    ).toEqual({ kind: "rate-limited", retryAfterSeconds: 120 });
    expect(problemOf(responseError(429, {}))).toEqual({
      kind: "rate-limited",
      retryAfterSeconds: 60,
    });
  });

  it("treats a request with no answer as no signal, and an unknown answer as a failure", () => {
    expect(problemOf(new TypeError("Failed to fetch"))).toEqual({
      kind: "no-signal",
    });
    const timeout = new Error("timed out");
    timeout.name = "TimeoutError";
    expect(problemOf(timeout)).toEqual({ kind: "no-signal" });
    expect(problemOf(responseError(500, { detail: "boom" }))).toEqual({
      kind: "failed",
    });
    expect(problemOf(responseError(418, {}))).toEqual({ kind: "failed" });
  });

  it("maps the statuses the screens name", () => {
    expect(problemOf(responseError(422, {}))).toEqual({ kind: "rejected" });
    expect(problemOf(responseError(503, {}))).toEqual({ kind: "unavailable" });
    expect(problemOf(responseError(401, {}))).toEqual({
      kind: "session-ended",
    });
  });

  it("never gives a plain-words message that carries a code or an abbreviation", () => {
    const problems: Problem[] = [
      { kind: "rate-limited", retryAfterSeconds: 60 },
      { kind: "rejected" },
      { kind: "email-code-wrong" },
      { kind: "authenticator-wrong" },
      { kind: "not-set-up" },
      { kind: "no-authenticator" },
      { kind: "authenticator-session" },
      { kind: "forbidden" },
      { kind: "not-found" },
      { kind: "session-ended" },
      { kind: "no-signal" },
      { kind: "unavailable" },
      { kind: "failed" },
    ];
    for (const problem of problems) {
      expect(problemMessage(problem)).not.toMatch(INTERNAL_WORDS);
    }
  });
});

describe("requestEmailCode", () => {
  it("asks for a code for the printix app and the address typed", async () => {
    const spy = routeFetch({
      [START]: () => json(200, { message: "sent" }),
    });

    const outcome = await requestEmailCode(newSession(), EMAIL);

    expect(outcome).toEqual({ ok: true, value: true });
    const body = await spy.mock.calls[0]?.[0].json();
    expect(body).toEqual({ email: EMAIL });
  });

  it("reports rate limiting as its own problem", async () => {
    routeFetch({
      [START]: () =>
        apiError(429, { error: "too many" }, { "Retry-After": "30" }),
    });

    const outcome = await requestEmailCode(newSession(), EMAIL);

    expect(outcome).toEqual({
      ok: false,
      problem: { kind: "rate-limited", retryAfterSeconds: 30 },
    });
  });
});

describe("verifySignIn", () => {
  it("sends the emailed code and the authenticator code together", async () => {
    const session = newSession();
    const spy = routeFetch({
      [VERIFY]: () => json(200, loginBody({ sessionToken: "s".repeat(43) })),
    });

    const outcome = await verifySignIn(session, {
      email: EMAIL,
      code: "123456",
      totpCode: "654321",
    });

    expect(outcome).toEqual({ ok: true, value: true });
    const body = await spy.mock.calls[0]?.[0].json();
    expect(body).toEqual({ email: EMAIL, code: "123456", totp_code: "654321" });
  });

  it("stores the session token in sessionStorage on success, and nothing else", async () => {
    const session = newSession();
    routeFetch({
      [VERIFY]: () =>
        json(
          200,
          loginBody({ sessionToken: "t".repeat(43), accessToken: "ACCESS-X" })
        ),
    });

    await verifySignIn(session, {
      email: EMAIL,
      code: "123456",
      totpCode: "654321",
    });

    expect(window.sessionStorage.getItem(SESSION_STORAGE_KEY)).toBe(
      "t".repeat(43)
    );
    expect(window.sessionStorage.length).toBe(1);
    expect(window.localStorage.length).toBe(0);
    expect(session.authorisation()).toEqual({
      Authorization: "Bearer ACCESS-X",
    });
  });

  it("maps each failure the screen must explain", async () => {
    const cases: [unknown, Problem][] = [
      [
        {
          status: 400,
          body: {
            detail: "Two-factor authentication code required or invalid",
          },
        },
        { kind: "authenticator-wrong" },
      ],
      [
        {
          status: 400,
          body: {
            detail: "That code is wrong or has expired. Request a new one.",
          },
        },
        { kind: "email-code-wrong" },
      ],
      [
        {
          status: 403,
          body: { detail: "Ask the team to give you access to this app." },
        },
        { kind: "not-set-up" },
      ],
      [{ status: 422, body: { detail: [] } }, { kind: "rejected" }],
    ];
    for (const [answer, expected] of cases) {
      const { status, body } = answer as { status: number; body: unknown };
      routeFetch({ [VERIFY]: () => apiError(status, body) });
      const outcome = await verifySignIn(newSession(), {
        email: EMAIL,
        code: "123456",
        totpCode: "654321",
      });
      expect(outcome).toEqual({ ok: false, problem: expected });
      vi.unstubAllGlobals();
    }
  });

  it("reports an unexpected answer as a failure, and does not store a session", async () => {
    const session = newSession();
    const reported = vi.fn();
    window.addEventListener("pwa:error", reported);
    routeFetch({
      [VERIFY]: () => json(200, { unexpected: true }),
    });

    const outcome = await verifySignIn(session, {
      email: EMAIL,
      code: "123456",
      totpCode: "654321",
    });

    expect(outcome).toEqual({ ok: false, problem: { kind: "failed" } });
    expect(window.sessionStorage.length).toBe(0);
    expect(session.hasSession()).toBe(false);
    expect(reported).toHaveBeenCalledTimes(1);
    window.removeEventListener("pwa:error", reported);
  });
});

describe("the no-authenticator answer", () => {
  const MESSAGE =
    "Add an authenticator at account.barrels.gd first, then sign in here again.";

  it("prefers the structured code over the text", () => {
    expect(
      problemOf(
        responseError(403, {
          code: "authenticator_required",
          detail: "Something unrelated",
        })
      )
    ).toEqual({ kind: "no-authenticator" });
  });

  it("reads the code from the end of the text when the body has no code field", () => {
    expect(
      problemOf(
        responseError(403, {
          detail: "Set up two-step verification first (authenticator_required)",
        })
      )
    ).toEqual({ kind: "no-authenticator" });
  });

  it("never shows the raw code, in either form", () => {
    expect(problemMessage({ kind: "no-authenticator" })).toBe(MESSAGE);
    expect(problemMessage({ kind: "no-authenticator" })).not.toContain(
      "authenticator_required"
    );
  });

  it("is shown on sign-in when the server refuses it, with the same message", async () => {
    routeFetch({
      [VERIFY]: () =>
        json(403, {
          code: "authenticator_required",
          detail: "Add an authenticator first.",
        }),
    });
    const outcome = await verifySignIn(newSession(), {
      email: EMAIL,
      code: "123456",
      totpCode: "654321",
    });
    expect(outcome).toEqual({
      ok: false,
      problem: { kind: "no-authenticator" },
    });
  });
});

describe("rate-limit wording", () => {
  it("states the wait in the server's seconds", () => {
    expect(
      problemMessage({ kind: "rate-limited", retryAfterSeconds: 60 })
    ).toBe("Too many attempts. Try again in 60 seconds.");
    expect(problemMessage({ kind: "rate-limited", retryAfterSeconds: 1 })).toBe(
      "Too many attempts. Try again in 1 second."
    );
  });
});

describe("a sign-in answer with an unreadable expiry", () => {
  it("is refused rather than renewed on every call", async () => {
    const session = newSession();
    const body = loginBody({ sessionToken: "t".repeat(43) });
    routeFetch({
      [VERIFY]: () =>
        json(200, { ...body, access_token_expires_at: "not a time" }),
    });
    const outcome = await verifySignIn(session, {
      email: EMAIL,
      code: "123456",
      totpCode: "654321",
    });
    expect(outcome).toEqual({ ok: false, problem: { kind: "failed" } });
    expect(session.hasSession()).toBe(false);
    expect(window.sessionStorage.length).toBe(0);
  });
});
