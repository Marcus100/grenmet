// @vitest-environment node
import { inspect } from "node:util";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const SECRET = "fake-secret-fake-secret-fake-secret-0";

const fakeEnv = vi.hoisted(() => ({
  AUTH_API_URL: "http://api.test",
  TRUSTED_WEB_SECRET: undefined as string | undefined,
  VISITOR_IP_PROXY_HOPS: 1,
}));

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve(new Headers({ "x-forwarded-for": "203.0.113.7" })),
}));
vi.mock("@/lib/env", () => ({ env: fakeEnv }));

import { POST as pushPost } from "./push/route";
import { POST as subscribePost } from "./subscribe/route";

const pushBody = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "BPubKeyAAAAAAAAAA", auth: "authsecretAAAA" },
};

function post(url: string, body: unknown) {
  return new Request(url, { method: "POST", body: JSON.stringify(body) });
}

let sent: Request | undefined;

function stubFetch(status: number, body: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn((request: Request) => {
      sent = request;
      return Promise.resolve(
        new Response(JSON.stringify(body), {
          status,
          headers: { "content-type": "application/json" },
        })
      );
    })
  );
}

beforeEach(() => {
  sent = undefined;
  fakeEnv.TRUSTED_WEB_SECRET = undefined;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("visitor address forwarding", () => {
  it("sends the visitor address with an email sign-up", async () => {
    fakeEnv.TRUSTED_WEB_SECRET = SECRET;
    stubFetch(202, { message: "Check your email" });
    const response = await subscribePost(
      post("https://gms.example.test/api/alerts/subscribe", {
        email: "ada@example.test",
      })
    );
    expect(response.status).toBe(202);
    expect(sent?.url).toContain("/subscriptions");
    expect(sent?.headers.get("x-visitor-ip")).toBe("203.0.113.7");
    expect(sent?.headers.get("x-visitor-secret")).toBe(SECRET);
  });

  it("sends the visitor address with a browser push sign-up", async () => {
    fakeEnv.TRUSTED_WEB_SECRET = SECRET;
    stubFetch(201, {});
    const response = await pushPost(
      post("https://gms.example.test/api/alerts/push", pushBody)
    );
    expect(response.status).toBe(201);
    expect(sent?.headers.get("x-visitor-ip")).toBe("203.0.113.7");
    expect(sent?.headers.get("x-visitor-secret")).toBe(SECRET);
  });

  it("sends no visitor headers and does not fail when the secret is unset", async () => {
    stubFetch(202, { message: "Check your email" });
    const response = await subscribePost(
      post("https://gms.example.test/api/alerts/subscribe", {
        email: "ada@example.test",
      })
    );
    expect(response.status).toBe(202);
    expect(sent?.headers.get("x-visitor-ip")).toBeNull();
    expect(sent?.headers.get("x-visitor-secret")).toBeNull();

    stubFetch(201, {});
    const pushed = await pushPost(
      post("https://gms.example.test/api/alerts/push", pushBody)
    );
    expect(pushed.status).toBe(201);
    expect(sent?.headers.get("x-visitor-secret")).toBeNull();
  });

  it("never lets the secret travel in an error that escapes the route", async () => {
    fakeEnv.TRUSTED_WEB_SECRET = SECRET;
    stubFetch(500, {});
    const error = await subscribePost(
      post("https://gms.example.test/api/alerts/subscribe", {
        email: "ada@example.test",
      })
    ).catch((caught: unknown) => caught);
    expect(sent?.headers.get("x-visitor-secret")).toBe(SECRET);
    expect(inspect(error, { depth: 6 })).not.toContain(SECRET);
  });
});
