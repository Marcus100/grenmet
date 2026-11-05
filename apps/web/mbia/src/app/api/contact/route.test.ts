// @vitest-environment node
import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const contactSendSiteContactMessage = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  contactSendSiteContactMessage,
}));
vi.mock("@/lib/report-error", () => ({ reportError }));

import { POST } from "./route";

const valid = {
  name: "Jane Reader",
  email: "jane@example.test",
  subject: "General enquiry",
  message: "I would like to ask about parking.",
};

function request(body: unknown) {
  return new Request("https://mbia.example.test/api/contact", {
    method: "POST",
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

beforeEach(() => {
  contactSendSiteContactMessage.mockReset();
  reportError.mockReset();
});

describe("POST /api/contact", () => {
  it("forwards a valid message to the mbia per-site route", async () => {
    contactSendSiteContactMessage.mockReturnValue({
      unwrap: () => Promise.resolve({ ok: true }),
    });
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
    contactSendSiteContactMessage.mockReturnValue({
      unwrap: () => Promise.resolve({ ok: true }),
    });
    const response = await POST(request(valid));
    expect(response.status).toBe(200);
    const [options] = contactSendSiteContactMessage.mock.calls[0] as [
      { body: Record<string, unknown> },
    ];
    expect(options.body.turnstile_token).toBeUndefined();
    // The deprecated body field must not reach the per-site route.
    expect(options.body).not.toHaveProperty("site");
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

  it("reports upstream failure and tells the visitor it was not sent", async () => {
    apiFails(responseError(500));
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
