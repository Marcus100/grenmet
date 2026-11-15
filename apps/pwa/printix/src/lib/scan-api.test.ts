import { afterEach, describe, expect, it, vi } from "vitest";
import {
  classifyFailure,
  DEFAULT_RETRY_SECONDS,
  parseRetryAfter,
  readSummary,
  submitScan,
} from "@/lib/scan-api";
import { API_ORIGIN, SECRET, SUMMARY } from "@/test/fixtures";

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
