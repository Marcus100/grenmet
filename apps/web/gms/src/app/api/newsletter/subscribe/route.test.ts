// @vitest-environment node
import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionsSubscribe = vi.hoisted(() => vi.fn());

vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  subscriptionsSubscribe,
}));
vi.mock("@/lib/visitor-client", () => ({
  visitorClient: async () => ({}),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://gms.example.test/api/newsletter/subscribe", {
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
  subscriptionsSubscribe.mockReset();
});

describe("POST /api/newsletter/subscribe", () => {
  it("forwards the address to the newsletter list with its Turnstile token", async () => {
    subscriptionsSubscribe.mockReturnValue({
      unwrap: () =>
        Promise.resolve({ message: "If this address can be subscribed..." }),
    });
    const response = await POST(
      request({
        email: "reader@example.test",
        consent: true,
        turnstileToken: "tok-1",
      })
    );
    expect(response.status).toBe(202);
    expect(subscriptionsSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          list_key: "gms-newsletter",
          email: "reader@example.test",
          turnstile_token: "tok-1",
        },
      })
    );
  });

  it("refuses a request without consent before it reaches FastAPI", async () => {
    const response = await POST(
      request({ email: "reader@example.test", consent: false })
    );
    expect(response.status).toBe(400);
    expect(subscriptionsSubscribe).not.toHaveBeenCalled();
  });

  it("refuses a malformed address before it reaches FastAPI", async () => {
    const response = await POST(
      request({ email: "not-an-email", consent: true })
    );
    expect(response.status).toBe(400);
    expect(subscriptionsSubscribe).not.toHaveBeenCalled();
  });

  it("reports a failed verification as a plain 400", async () => {
    subscriptionsSubscribe.mockReturnValue({
      unwrap: () => Promise.reject(responseError(400)),
    });
    const response = await POST(
      request({ email: "reader@example.test", consent: true })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Verification failed. Please try again.",
    });
  });

  it("passes rate limiting through", async () => {
    subscriptionsSubscribe.mockReturnValue({
      unwrap: () => Promise.reject(responseError(429)),
    });
    const response = await POST(
      request({ email: "reader@example.test", consent: true })
    );
    expect(response.status).toBe(429);
  });

  it("lets an unexpected server error reach error handling", async () => {
    subscriptionsSubscribe.mockReturnValue({
      unwrap: () => Promise.reject(responseError(500)),
    });
    await expect(
      POST(request({ email: "reader@example.test", consent: true }))
    ).rejects.toThrow();
  });
});
