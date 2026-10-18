// @vitest-environment node
import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const contactSendContactMessage = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  contactSendContactMessage,
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

beforeEach(() => {
  contactSendContactMessage.mockReset();
  reportError.mockReset();
});

describe("POST /api/contact", () => {
  it("forwards a valid message to FastAPI with the mbia site key", async () => {
    contactSendContactMessage.mockReturnValue({
      unwrap: () => Promise.resolve({ ok: true }),
    });
    const response = await POST(
      request({ ...valid, turnstileToken: "token-1" })
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    expect(contactSendContactMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { site: "mbia", ...valid, turnstile_token: "token-1" },
      })
    );
  });

  it("rejects invalid input without calling FastAPI", async () => {
    for (const body of ["not json", { ...valid, email: "nope" }, {}]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(contactSendContactMessage).not.toHaveBeenCalled();
  });

  it("passes rate limiting through as 429", async () => {
    contactSendContactMessage.mockReturnValue({
      unwrap: () => Promise.reject(responseError(429)),
    });
    const response = await POST(request(valid));
    expect(response.status).toBe(429);
  });

  it("reports upstream failure and tells the visitor it was not sent", async () => {
    contactSendContactMessage.mockReturnValue({
      unwrap: () => Promise.reject(responseError(500)),
    });
    const response = await POST(request(valid));
    expect(response.status).toBe(502);
    expect(reportError).toHaveBeenCalledOnce();
  });
});
