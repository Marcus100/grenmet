// @vitest-environment node
import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const feedbackSendPageFeedback = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  feedbackSendPageFeedback,
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_API_URL: "http://api.test" } }));
vi.mock("@/lib/report-error", () => ({ reportError }));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://docs.example.test/api/feedback", {
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
  feedbackSendPageFeedback.mockReset();
  reportError.mockReset();
});

describe("POST /api/feedback", () => {
  it("forwards a valid answer to FastAPI with the docs site key", async () => {
    feedbackSendPageFeedback.mockReturnValue({
      unwrap: () => Promise.resolve({ ok: true }),
    });
    const response = await POST(
      request({ pagePath: "/plan/roles", helpful: false, comment: " Unclear " })
    );
    expect(response.status).toBe(202);
    expect(feedbackSendPageFeedback).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "http://api.test",
        body: {
          site: "docs",
          page_path: "/plan/roles",
          helpful: false,
          comment: "Unclear",
        },
      })
    );
  });

  it("rejects malformed input without calling FastAPI", async () => {
    for (const body of [
      "not json",
      {},
      { pagePath: "no-slash", helpful: true },
      { pagePath: "/a?x=1", helpful: true },
      { pagePath: "/a", helpful: "yes" },
      { pagePath: "/a", helpful: true, comment: "x".repeat(1001) },
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(feedbackSendPageFeedback).not.toHaveBeenCalled();
  });

  it("passes rate limiting through as 429", async () => {
    feedbackSendPageFeedback.mockReturnValue({
      unwrap: () => Promise.reject(responseError(429)),
    });
    const response = await POST(request({ pagePath: "/a", helpful: true }));
    expect(response.status).toBe(429);
  });

  it("reports unexpected failures and answers 502", async () => {
    feedbackSendPageFeedback.mockReturnValue({
      unwrap: () => Promise.reject(responseError(500)),
    });
    const response = await POST(request({ pagePath: "/a", helpful: true }));
    expect(response.status).toBe(502);
    expect(reportError).toHaveBeenCalledOnce();
  });
});
