import { afterEach, describe, expect, it, vi } from "vitest";

// The module under test imports `server-only` and `next/headers`, neither of
// which resolves in a plain node test env — stub both.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(new Headers()),
  cookies: () =>
    Promise.resolve({ get: () => undefined, set: () => undefined }),
}));

import { AuthApiError } from "../../types";
import { authApiFetch } from "../auth-api-fetch";

const config = {
  appName: "test",
  authApiBaseUrl: "http://auth.test",
  authApiPrefix: "/api/v1",
  authAppUrl: "http://app.test",
  sessionCookieName: "grenmet_session",
};

const TIMED_OUT = /did not respond within/i;
const TIMED_OUT_5MS = /did not respond within 5ms/i;

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("authApiFetch timeout", () => {
  it("passes an AbortSignal to fetch so requests are bounded", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(jsonResponse({ ok: true }));

    await authApiFetch(config, "/ping");

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws a plain (non-AuthApiError) error when the request times out", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation timed out.", "TimeoutError")
    );

    const error = await authApiFetch(config, "/ping").catch((e: unknown) => e);

    // Must NOT be an AuthApiError — callers treat those as expired sessions.
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(AuthApiError);
    expect((error as Error).message).toMatch(TIMED_OUT);
  });

  it("honours a configured timeout and aborts a hanging backend", async () => {
    // A backend that never responds, but respects the abort signal.
    vi.spyOn(globalThis, "fetch").mockImplementation(
      (_url, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = (init as RequestInit | undefined)?.signal;
          signal?.addEventListener("abort", () =>
            reject(new DOMException("aborted", "TimeoutError"))
          );
        })
    );

    await expect(
      authApiFetch({ ...config, authApiTimeoutMs: 5 }, "/slow")
    ).rejects.toThrow(TIMED_OUT_5MS);
  });

  it("still surfaces non-2xx responses as AuthApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "nope" }, 401)
    );

    const error = await authApiFetch(config, "/ping").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AuthApiError);
    expect((error as AuthApiError).status).toBe(401);
  });
});
