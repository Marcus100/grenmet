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

const TIMED_OUT = /did not respond within/iu;
const TIMED_OUT_5MS = /did not respond within 5ms/iu;
const pingParser = {
  parse(value: unknown): { ok: boolean } {
    if (
      typeof value === "object" &&
      value !== null &&
      "ok" in value &&
      typeof value.ok === "boolean"
    ) {
      return { ok: value.ok };
    }
    throw new Error("Invalid ping response");
  },
};
const unknownParser = { parse: (value: unknown) => value };

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

    await authApiFetch(config, "/ping", pingParser);

    const init = fetchMock.mock.calls[0]?.[1];
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it("throws a plain (non-AuthApiError) error when the request times out", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new DOMException("The operation timed out.", "TimeoutError")
    );

    const error = await authApiFetch(config, "/ping", pingParser).catch(
      (e: unknown) => e
    );

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
      authApiFetch({ ...config, authApiTimeoutMs: 5 }, "/slow", pingParser)
    ).rejects.toThrow(TIMED_OUT_5MS);
  });

  it("still surfaces non-2xx responses as AuthApiError", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "nope" }, 401)
    );

    const error = await authApiFetch(config, "/ping", pingParser).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AuthApiError);
    expect((error as AuthApiError).status).toBe(401);
  });
});

describe("authApiFetch error detail", () => {
  it("joins the messages of a validation error list into a sentence", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          detail: [
            { type: "missing", loc: ["body", "email"], msg: "Field required" },
            {
              type: "string_too_short",
              loc: ["body", "password"],
              msg: "String should have at least 8 characters.",
            },
          ],
        },
        422
      )
    );

    const error = await authApiFetch(config, "/ping", pingParser).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AuthApiError);
    expect((error as AuthApiError).status).toBe(422);
    expect((error as AuthApiError).detail).toBe(
      "Field required. String should have at least 8 characters."
    );
  });

  it("keeps the raw body when detail is an object with no messages", async () => {
    const body = { detail: { code: "rate_limited" } };
    vi.spyOn(globalThis, "fetch").mockResolvedValue(jsonResponse(body, 429));

    const error = await authApiFetch(config, "/ping", pingParser).catch(
      (e: unknown) => e
    );

    expect((error as AuthApiError).detail).toBe(JSON.stringify(body));
  });

  it("carries the field-level errors of the documented 422 envelope", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          detail: "Validation error",
          errors: [
            {
              type: "string_too_short",
              loc: ["body", "info", 0, "web"],
              msg: "String should have at least 8 characters",
            },
            { type: "missing", loc: ["body", "name"], msg: "Field required" },
          ],
        },
        422
      )
    );

    const error = await authApiFetch(config, "/ping", pingParser).catch(
      (e: unknown) => e
    );

    expect(error).toBeInstanceOf(AuthApiError);
    const apiError = error as AuthApiError;
    // `detail` keeps its one-line meaning for existing callers.
    expect(apiError.detail).toBe("Validation error");
    expect(apiError.errors).toEqual([
      {
        type: "string_too_short",
        loc: ["body", "info", 0, "web"],
        msg: "String should have at least 8 characters",
      },
      { type: "missing", loc: ["body", "name"], msg: "Field required" },
    ]);
  });

  it("drops error items that do not match the documented shape", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse(
        {
          detail: "Validation error",
          errors: [
            { type: "missing", loc: ["body", "name"], msg: "Field required" },
            { loc: ["body", "x"] },
            { type: "value_error", loc: "body", msg: "bad" },
            "not an object",
            null,
          ],
        },
        422
      )
    );

    const error = (await authApiFetch(config, "/ping", pingParser).catch(
      (e: unknown) => e
    )) as AuthApiError;

    expect(error.errors).toEqual([
      { type: "missing", loc: ["body", "name"], msg: "Field required" },
    ]);
  });

  it("returns no field errors when the API sends none", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      jsonResponse({ detail: "Nope" }, 403)
    );

    const error = (await authApiFetch(config, "/ping", pingParser).catch(
      (e: unknown) => e
    )) as AuthApiError;

    expect(error.detail).toBe("Nope");
    expect(error.errors).toEqual([]);
  });
});

it("sends a live access token in the header without caching or leaking it into fetch options", async () => {
  const fetchMock = vi
    .spyOn(globalThis, "fetch")
    .mockResolvedValue(
      jsonResponse({ role_names: [], permission_keys: [], is_superuser: false })
    );
  await authApiFetch(config, "/auth/access/me", unknownParser, {
    accessToken: "test-access-token",
  });
  const init = fetchMock.mock.calls[0]?.[1];
  expect(new Headers(init?.headers).get("authorization")).toBe(
    "Bearer test-access-token"
  );
  expect(init?.cache).toBe("no-store");
  expect(init).not.toHaveProperty("accessToken");
});
