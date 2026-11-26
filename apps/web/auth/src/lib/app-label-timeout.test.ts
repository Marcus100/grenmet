import { afterEach, beforeEach, expect, it, vi } from "vitest";

// The real fetch wrapper (@barrelsgd/auth/server) is used here on purpose: a
// mock of it once hid that the short timeout never reached fetch.
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  cookies: async () => ({ get: () => undefined }),
  headers: async () => new Headers(),
}));
vi.mock("./auth-config", () => ({
  getAuthConfig: () => ({
    authApiBaseUrl: "https://api.example.test",
    authApiPrefix: "/api/v1",
    sessionCookieName: "auth_session",
  }),
}));

import { APP_LABEL_TIMEOUT_MS, fetchAppLabel } from "./handoff";

const DEFAULT_WRAPPER_TIMEOUT_MS = 10_000;

/** A registry that never answers: only the request's abort signal ends it. */
function hungFetch(_url: unknown, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    init?.signal?.addEventListener("abort", () => reject(init.signal?.reason));
  });
}

/** AbortSignal.timeout on the fake clock, with the error name the real one uses. */
function fakeClockTimeout(milliseconds: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(
    () => controller.abort(new DOMException("timed out", "TimeoutError")),
    milliseconds
  );
  return controller.signal;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(AbortSignal, "timeout").mockImplementation(fakeClockTimeout);
  vi.stubGlobal("fetch", vi.fn(hungFetch));
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settledAfter(
  lookup: Promise<string | null>,
  milliseconds: number
): Promise<string | null | "still waiting"> {
  let outcome: string | null | "still waiting" = "still waiting";
  lookup.then((label) => {
    outcome = label;
  });
  await vi.advanceTimersByTimeAsync(milliseconds);
  return outcome;
}

it("gives up on a hung registry at about 1.5 seconds, not the 10-second default", async () => {
  const lookup = fetchAppLabel("bookings", APP_LABEL_TIMEOUT_MS);

  expect(await settledAfter(lookup, APP_LABEL_TIMEOUT_MS - 1)).toBe(
    "still waiting"
  );
  expect(await settledAfter(lookup, 1)).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
  expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe(
    "https://api.example.test/api/v1/auth/apps/bookings"
  );
});

it("keeps the wrapper's own default when no timeout is asked for", async () => {
  const lookup = fetchAppLabel("bookings");

  expect(await settledAfter(lookup, DEFAULT_WRAPPER_TIMEOUT_MS - 1)).toBe(
    "still waiting"
  );
  expect(await settledAfter(lookup, 1)).toBeNull();
});
