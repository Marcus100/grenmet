import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyFailure,
  DEFAULT_RETRY_SECONDS,
  parseRetryAfter,
  readOfflineList,
  readSummary,
  sendOfflineAdmissions,
  submitScan,
} from "@/lib/scan-api";
import { API_ORIGIN, OFFLINE_LIST, SECRET, SUMMARY } from "@/test/fixtures";

const connection = { origin: API_ORIGIN, secret: SECRET };

function jsonResponse(status: number, body: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Stubs fetch with one answer and returns the spy, so tests can read the request. */
function stubFetch(answer: () => Response | Promise<Response>) {
  const spy = vi.fn(async (_request: Request) => answer());
  vi.stubGlobal("fetch", spy);
  return spy;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("classifyFailure", () => {
  it("maps every status the scanner routes can return", () => {
    expect(classifyFailure(401, null)).toEqual({
      kind: "pairing",
      problem: "not-recognised",
    });
    expect(classifyFailure(403, null)).toEqual({
      kind: "pairing",
      problem: "revoked-or-expired",
    });
    expect(classifyFailure(422, null)).toEqual({ kind: "rejected" });
    expect(classifyFailure(500, null)).toEqual({ kind: "failed" });
    expect(classifyFailure(503, null)).toEqual({ kind: "failed" });
  });

  it("treats no answer at all as no signal", () => {
    expect(classifyFailure(null, null)).toEqual({ kind: "no-signal" });
  });

  it("reads Retry-After on a 429 and falls back to a minute", () => {
    expect(classifyFailure(429, "42")).toEqual({
      kind: "rate-limited",
      retryAfterSeconds: 42,
    });
    expect(classifyFailure(429, null)).toEqual({
      kind: "rate-limited",
      retryAfterSeconds: DEFAULT_RETRY_SECONDS,
    });
  });
});

describe("parseRetryAfter", () => {
  it("accepts whole seconds and caps the wait at an hour", () => {
    expect(parseRetryAfter("15")).toBe(15);
    expect(parseRetryAfter("999999")).toBe(3600);
  });

  it("ignores a value that is not a positive whole number", () => {
    for (const value of [null, "", "0", "-5", "soon", "1.5"]) {
      expect(parseRetryAfter(value)).toBe(DEFAULT_RETRY_SECONDS);
    }
  });
});

describe("submitScan", () => {
  it("sends the value to the admissions route with the secret only in the header", async () => {
    const fetch = stubFetch(() =>
      jsonResponse(200, { outcome: "admitted", printed_number: "042" })
    );
    const answer = await submitScan(connection, "042");

    expect(answer).toEqual({
      kind: "checked",
      result: { outcome: "admitted", printed_number: "042" },
    });
    const request = fetch.mock.calls[0]?.[0];
    expect(request?.url).toBe(`${API_ORIGIN}/api/v1/printix/public/admissions`);
    expect(request?.method).toBe("POST");
    expect(request?.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(request?.url).not.toContain(SECRET);
    expect(await request?.json()).toEqual({ value: "042" });
  });

  it("maps a refused 401 and 403 to the pairing problem", async () => {
    stubFetch(() => jsonResponse(401, { detail: "not recognised" }));
    expect(await submitScan(connection, "1")).toEqual({
      kind: "pairing",
      problem: "not-recognised",
    });
    stubFetch(() => jsonResponse(403, { detail: "expired" }));
    expect(await submitScan(connection, "1")).toEqual({
      kind: "pairing",
      problem: "revoked-or-expired",
    });
  });

  it("maps a 429 with its Retry-After", async () => {
    stubFetch(() =>
      jsonResponse(429, { detail: "slow down" }, { "Retry-After": "60" })
    );
    expect(await submitScan(connection, "1")).toEqual({
      kind: "rate-limited",
      retryAfterSeconds: 60,
    });
  });

  it("maps a 422 and a server error", async () => {
    stubFetch(() => jsonResponse(422, { detail: "bad", errors: [] }));
    expect(await submitScan(connection, "1")).toEqual({ kind: "rejected" });
    stubFetch(() => jsonResponse(500, { detail: "oops" }));
    expect(await submitScan(connection, "1")).toEqual({ kind: "failed" });
  });

  it("reports no signal when the network rejects the request", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    expect(await submitScan(connection, "1")).toEqual({ kind: "no-signal" });
  });

  it("never invents a verdict from a 200 that does not match the contract", async () => {
    stubFetch(() => jsonResponse(200, { outcome: "maybe" }));
    expect(await submitScan(connection, "1")).toEqual({ kind: "failed" });
  });
});

describe("readSummary", () => {
  it("returns the event and counts for a valid summary", async () => {
    const fetch = stubFetch(() => jsonResponse(200, SUMMARY));
    expect(await readSummary(connection)).toEqual({
      kind: "summary",
      summary: SUMMARY,
    });
    const request = fetch.mock.calls[0]?.[0];
    expect(request?.url).toBe(`${API_ORIGIN}/api/v1/printix/public/summary`);
    expect(request?.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
  });

  it("maps a revoked pairing and a limited read", async () => {
    stubFetch(() => jsonResponse(403, { detail: "revoked" }));
    expect(await readSummary(connection)).toEqual({
      kind: "pairing",
      problem: "revoked-or-expired",
    });
    stubFetch(() =>
      jsonResponse(429, { error: "slow" }, { "Retry-After": "30" })
    );
    expect(await readSummary(connection)).toEqual({
      kind: "rate-limited",
      retryAfterSeconds: 30,
    });
  });
});

const ADMISSION = {
  client_ref: "00000000-0000-4000-8000-000000000001",
  value: "PX-0000000101",
  scanned_at: "2026-12-26T20:01:00.000Z",
};

describe("offline calls", () => {
  it("reads the list with a time limit and the pairing secret", async () => {
    const fetch = stubFetch(() => jsonResponse(200, OFFLINE_LIST));
    expect(await readOfflineList(connection)).toEqual({
      kind: "list",
      list: OFFLINE_LIST,
    });
    const request = fetch.mock.calls[0]?.[0];
    expect(request?.url).toBe(
      `${API_ORIGIN}/api/v1/printix/public/offline-tickets`
    );
    expect(request?.headers.get("authorization")).toBe(`Bearer ${SECRET}`);
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });

  it("tells a refused event apart from a failure", async () => {
    stubFetch(() =>
      jsonResponse(409, {
        detail: "Offline mode is off for this event.",
        code: "offline_not_available",
      })
    );
    expect(await readOfflineList(connection)).toEqual({
      kind: "offline-unavailable",
    });
    stubFetch(() =>
      jsonResponse(409, {
        detail: "Offline mode is off for this event.",
        code: "offline_not_available",
      })
    );
    expect(await sendOfflineAdmissions(connection, [ADMISSION])).toEqual({
      kind: "offline-unavailable",
    });
    stubFetch(() => jsonResponse(409, { detail: "other", code: "other" }));
    expect(await readOfflineList(connection)).toEqual({ kind: "failed" });
  });

  it("treats a request that timed out as no signal", async () => {
    stubFetch(() =>
      Promise.reject(new DOMException("timed out", "TimeoutError"))
    );
    expect(await sendOfflineAdmissions(connection, [ADMISSION])).toEqual({
      kind: "no-signal",
    });
    stubFetch(() =>
      Promise.reject(new DOMException("timed out", "TimeoutError"))
    );
    expect(await readOfflineList(connection)).toEqual({ kind: "no-signal" });
  });

  it("sends admissions with a time limit and reads the answer", async () => {
    const fetch = stubFetch(() =>
      jsonResponse(200, {
        results: [{ client_ref: ADMISSION.client_ref, outcome: "admitted" }],
        deferred: 0,
      })
    );
    const answer = await sendOfflineAdmissions(connection, [ADMISSION]);
    expect(answer.kind).toBe("synced");
    const request = fetch.mock.calls[0]?.[0];
    expect(await request?.json()).toEqual({ admissions: [ADMISSION] });
    expect(request?.signal).toBeInstanceOf(AbortSignal);
  });
});
