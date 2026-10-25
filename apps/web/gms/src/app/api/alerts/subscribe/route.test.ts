// @vitest-environment node
import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionsSubscribe = vi.hoisted(() => vi.fn());

vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  subscriptionsSubscribe,
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_API_URL: "http://api.test" } }));
vi.mock("@/lib/visitor-client", () => ({
  visitorClient: () => Promise.resolve("visitor-client"),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://gms.example.test/api/alerts/subscribe", {
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

describe("POST /api/alerts/subscribe", () => {
  it("subscribes the address to the gms-alerts list", async () => {
    subscriptionsSubscribe.mockReturnValue({
      unwrap: () => Promise.resolve({ message: "Check your email" }),
    });
    const response = await POST(request({ email: "ada@example.test" }));
    expect(response.status).toBe(202);
    expect(subscriptionsSubscribe).toHaveBeenCalledWith({
      client: "visitor-client",
      body: { list_key: "gms-alerts", email: "ada@example.test" },
    });
  });

  it("rejects an invalid address without calling FastAPI", async () => {
    const response = await POST(request({ email: "nope" }));
    expect(response.status).toBe(400);
    expect(subscriptionsSubscribe).not.toHaveBeenCalled();
  });

  it("rejects a body that is not JSON", async () => {
    expect((await POST(request("{"))).status).toBe(400);
  });

  it("passes rate limiting through as 429", async () => {
    subscriptionsSubscribe.mockReturnValue({
      unwrap: () => Promise.reject(responseError(429)),
    });
    const response = await POST(request({ email: "ada@example.test" }));
    expect(response.status).toBe(429);
  });
});
