// @vitest-environment node
import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const contactSendDataRequest = vi.hoisted(() => vi.fn());
const reportError = vi.hoisted(() => vi.fn());

vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  contactSendDataRequest,
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_API_URL: "http://api.test" } }));
vi.mock("@/lib/report-error", () => ({ reportError }));

import { POST } from "./route";

const valid = {
  name: "Ada Researcher",
  email: "ada@example.test",
  organisation: "University of Somewhere",
  purpose: "Rainfall trends for a flood study.",
  parameters: ["rainfall", "temperature"],
  stations: "Maurice Bishop International Airport",
  periodStart: "2000-01-01",
  periodEnd: "2020-12-31",
  dataFormat: "csv",
  intendedUse: "academic",
  consent: true,
};

function request(body: unknown) {
  return new Request("https://gms.example.test/api/data-request", {
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
  contactSendDataRequest.mockReset();
  reportError.mockReset();
});

describe("POST /api/data-request", () => {
  it("maps a valid request to the FastAPI body", async () => {
    contactSendDataRequest.mockReturnValue({
      unwrap: () => Promise.resolve({ ok: true }),
    });
    const response = await POST(request(valid));
    expect(response.status).toBe(202);
    expect(contactSendDataRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        baseURL: "http://api.test",
        body: expect.objectContaining({
          organisation: "University of Somewhere",
          period_start: "2000-01-01",
          period_end: "2020-12-31",
          data_format: "csv",
          intended_use: "academic",
          consent: true,
          website: null,
        }),
      })
    );
  });

  it("rejects invalid input without calling FastAPI", async () => {
    for (const body of [
      "not json",
      {},
      { ...valid, consent: false },
      { ...valid, parameters: [] },
      { ...valid, email: "nope" },
      { ...valid, periodStart: "2021-01-01", periodEnd: "2020-01-01" },
    ]) {
      const response = await POST(request(body));
      expect(response.status).toBe(400);
    }
    expect(contactSendDataRequest).not.toHaveBeenCalled();
  });

  it("forwards the honeypot value so FastAPI can drop the request", async () => {
    contactSendDataRequest.mockReturnValue({
      unwrap: () => Promise.resolve({ ok: true }),
    });
    await POST(request({ ...valid, website: "http://spam.test" }));
    expect(contactSendDataRequest).toHaveBeenCalledWith(
      expect.objectContaining({
        body: expect.objectContaining({ website: "http://spam.test" }),
      })
    );
  });

  it("passes rate limiting through as 429", async () => {
    contactSendDataRequest.mockReturnValue({
      unwrap: () => Promise.reject(responseError(429)),
    });
    expect((await POST(request(valid))).status).toBe(429);
  });

  it("reports unexpected failures and answers 502", async () => {
    contactSendDataRequest.mockReturnValue({
      unwrap: () => Promise.reject(responseError(500)),
    });
    expect((await POST(request(valid))).status).toBe(502);
    expect(reportError).toHaveBeenCalledOnce();
  });
});
