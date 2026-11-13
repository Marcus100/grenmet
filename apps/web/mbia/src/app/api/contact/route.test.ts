// @vitest-environment node
import { ResponseError } from "@barrelsgd/api-client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const contactSendSiteContactMessage = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());
const testEnv = vi.hoisted(() => ({
  AUTH_API_URL: "https://api.example.test",
  TRUSTED_WEB_SECRET: undefined as string | undefined,
  VISITOR_IP_PROXY_HOPS: 1,
}));

vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  contactSendSiteContactMessage,
}));
vi.mock("@/lib/report-error", () => ({ reportError }));
vi.mock("@/lib/env", () => ({ env: testEnv }));

import { POST } from "./route";

const SECRET = "s".repeat(32);

const valid = {
  name: "Jane Reader",
  email: "jane@example.test",
  subject: "General enquiry",
  message: "I would like to ask about parking.",
};

function request(body: unknown, headers: Record<string, string> = {}) {
  return new Request("https://mbia.example.test/api/contact", {
    method: "POST",
    headers,
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function responseError(status: number) {
  return new ResponseError({
    data: {},
    status,
    statusText: "",
    contentType: undefined,
    request: new Request("https://api.example.test"),
    response: new Response(null, { status }),
  });
}

function apiFails(error: unknown) {
  contactSendSiteContactMessage.mockReturnValue({
    unwrap: () => Promise.reject(error),
  });
}

function apiSucceeds() {
  contactSendSiteContactMessage.mockReturnValue({
    unwrap: () => Promise.resolve({ ok: true }),
  });
}

// The options of the first call, including the per-request API client.
function firstCallOptions() {
  const [options] = contactSendSiteContactMessage.mock.calls[0] as [
    {
      body: Record<string, unknown>;
      client: (config: { method: string; url: string }) => Promise<unknown>;
    },
  ];
  return options;
}

beforeEach(() => {
  contactSendSiteContactMessage.mockReset();
  reportError.mockReset();
  testEnv.TRUSTED_WEB_SECRET = undefined;
  testEnv.VISITOR_IP_PROXY_HOPS = 1;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("POST /api/contact", () => {
  it("forwards a valid message to the mbia per-site route", async () => {
    apiSucceeds();
    const response = await POST(
      request({ ...valid, turnstileToken: "token-1" })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(contactSendSiteContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        path: { site_key: "mbia" },
        body: { ...valid, turnstile_token: "token-1" },
      })
    );
  });

  it("sends no Turnstile token when the visitor did not solve the check", async () => {
    apiSucceeds();
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    expect(firstCallOptions().body.turnstile_token).toBeUndefined();
    // The deprecated body field must not reach the per-site route.
    expect(firstCallOptions().body).not.toHaveProperty("site");
  });

  it("forwards the visitor address with the shared secret, not the proxy's", async () => {
    testEnv.TRUSTED_WEB_SECRET = SECRET;
    apiSucceeds();
    const fetchSpy = vi.fn<(input: Request) => Promise<Response>>(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchSpy);

    await POST(request(valid, { "x-forwarded-for": "6.6.6.6, 203.0.113.7" }));
    // Send one request through the client the route built, and inspect it.
    await firstCallOptions().client({
      method: "POST",
      url: "https://api.example.test/ping",
    });

    const sent = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(sent.headers.get("X-Visitor-IP")).toBe("203.0.113.7");
    expect(sent.headers.get("X-Visitor-Secret")).toBe(SECRET);
  });

  it("sends no visitor headers without the shared secret", async () => {
    apiSucceeds();
    const fetchSpy = vi.fn<(input: Request) => Promise<Response>>(
      async () =>
        new Response("{}", {
          status: 200,
          headers: { "Content-Type": "application/json" },
        })
    );
    vi.stubGlobal("fetch", fetchSpy);

    await POST(request(valid, { "x-forwarded-for": "203.0.113.7" }));
    await firstCallOptions().client({
      method: "POST",
      url: "https://api.example.test/ping",
    });

    const sent = fetchSpy.mock.calls[0]?.[0] as Request;
    expect(sent.headers.get("X-Visitor-IP")).toBeNull();
    expect(sent.headers.get("X-Visitor-Secret")).toBeNull();
  });

  it("rejects invalid input without calling FastAPI", async () => {
    for (const body of [
      "not json",
      { ...valid, email: "nope" },
      { ...valid, subject: "Hacking" },
      {},
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(contactSendSiteContactMessage).not.toHaveBeenCalled();
  });

  it("passes rate limiting through as 429", async () => {
    apiFails(responseError(429));
    const response = await POST(request(valid));
    expect(response.status).toBe(429);
    expect(reportError).not.toHaveBeenCalled();
  });

  it("answers a validation refusal from FastAPI (422) as a friendly 400 without reporting", async () => {
    apiFails(responseError(422));
    const response = await POST(request(valid));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Please check your details and try again.",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("reports upstream failure and tells the visitor it was not sent", async () => {
    apiFails(responseError(500));
    const response = await POST(request(valid));
    expect(response.status).toBe(502);
    expect(reportError).toHaveBeenCalledOnce();
  });

  it("reports a 503 (Turnstile enabled without its secret) as a 502", async () => {
    apiFails(responseError(503));
    const response = await POST(request(valid));
    expect(response.status).toBe(502);
    expect(reportError).toHaveBeenCalledOnce();
  });

  it("reports a network failure and answers 502", async () => {
    apiFails(new TypeError("fetch failed"));
    const response = await POST(request(valid));
    expect(response.status).toBe(502);
    expect(reportError).toHaveBeenCalledOnce();
  });

  it("answers 400 when FastAPI rejects the Turnstile check", async () => {
    apiFails(responseError(400));
    const response = await POST(request({ ...valid, turnstileToken: "bad" }));
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Verification failed. Please try again.",
    });
    expect(reportError).not.toHaveBeenCalled();
  });

  it("tells the visitor when the site refuses contact (404) without reporting it", async () => {
    apiFails(responseError(404));
    const response = await POST(request(valid));
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      ok: false,
      error: "Contact messages are not available right now.",
    });
    expect(reportError).not.toHaveBeenCalled();
  });
});
