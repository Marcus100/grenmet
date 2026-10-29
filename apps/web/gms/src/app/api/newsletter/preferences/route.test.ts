// @vitest-environment node
import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const subscriptionsUnsubscribeOneList = vi.hoisted(() => vi.fn());

vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  subscriptionsUnsubscribeOneList,
}));
vi.mock("@/lib/visitor-client", () => ({
  visitorClient: async () => ({}),
}));

import { POST } from "./route";

function request(body: unknown) {
  return new Request("https://gms.example.test/api/newsletter/preferences", {
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
  subscriptionsUnsubscribeOneList.mockReset();
});

describe("POST /api/newsletter/preferences", () => {
  it("stops the one list named and returns what is left", async () => {
    subscriptionsUnsubscribeOneList.mockReturnValue({
      unwrap: () =>
        Promise.resolve({
          lists: [
            { list_key: "gms-newsletter", list_name: "GMS climate newsletter" },
          ],
        }),
    });

    const response = await POST(request({ token: "tok-1", listKey: "signal" }));

    expect(response.status).toBe(200);
    expect(subscriptionsUnsubscribeOneList).toHaveBeenCalledWith(
      expect.objectContaining({
        body: { token: "tok-1", list_key: "signal" },
      })
    );
    expect(await response.json()).toEqual({
      lists: [
        { listKey: "gms-newsletter", listName: "GMS climate newsletter" },
      ],
    });
  });

  it("rejects a body without a token or with a malformed list key", async () => {
    const missing = await POST(request({ listKey: "signal" }));
    const malformed = await POST(
      request({ token: "t", listKey: "Signal Mail" })
    );

    expect(missing.status).toBe(400);
    expect(malformed.status).toBe(400);
    expect(subscriptionsUnsubscribeOneList).not.toHaveBeenCalled();
  });

  it("answers a refused token with a plain 400 and no detail", async () => {
    subscriptionsUnsubscribeOneList.mockReturnValue({
      unwrap: () => Promise.reject(responseError(400)),
    });

    const response = await POST(request({ token: "bad", listKey: "signal" }));

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: "This link is not valid. Use the link in your latest email.",
    });
  });
});
