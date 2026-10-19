// @vitest-environment node
import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionsSubscribe = vi.hoisted(() => vi.fn());

vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  subscriptionsSubscribe,
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://signal.example.test/api/subscribe", {
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

describe("POST /api/subscribe", () => {
  it("forwards a valid email to FastAPI for the signal list", async () => {
    subscriptionsSubscribe.mockReturnValue({
      unwrap: () => Promise.resolve({ message: "Check your inbox." }),
    });
    const response = await POST(request({ email: "reader@example.test" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({
      ok: true,
      message: "Check your inbox.",
    });
    expect(subscriptionsSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { list_key: "signal", email: "reader@example.test" },
      })
    );
  });

  it("rejects malformed input without calling FastAPI", async () => {
    for (const body of [{ email: "nope" }, "not json", {}]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(subscriptionsSubscribe).not.toHaveBeenCalled();
  });

  it("passes rate limiting through as 429", async () => {
    subscriptionsSubscribe.mockReturnValue({
      unwrap: () => Promise.reject(responseError(429)),
    });
    const response = await POST(request({ email: "reader@example.test" }));
    expect(response.status).toBe(429);
  });

  it("lets unexpected failures surface instead of pretending success", async () => {
    subscriptionsSubscribe.mockReturnValue({
      unwrap: () => Promise.reject(responseError(500)),
    });
    await expect(
      POST(request({ email: "reader@example.test" }))
    ).rejects.toBeInstanceOf(ResponseError);
  });

  it("forwards the Turnstile token and maps a failed check to 400", async () => {
    subscriptionsSubscribe.mockReturnValue({
      unwrap: () => Promise.resolve({ message: "ok" }),
    });
    await POST(request({ email: "reader@example.test", turnstileToken: "t1" }));
    expect(subscriptionsSubscribe).toHaveBeenCalledWith(
      expect.objectContaining({
        body: {
          list_key: "signal",
          email: "reader@example.test",
          turnstile_token: "t1",
        },
      })
    );
    subscriptionsSubscribe.mockReturnValue({
      unwrap: () => Promise.reject(responseError(400)),
    });
    const response = await POST(
      request({ email: "reader@example.test", turnstileToken: "bad" })
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "Verification failed. Please try again.",
    });
  });
});
