// @vitest-environment node
import { ResponseError } from "@barrelsgd/api-client";
import { beforeEach, describe, expect, it, vi } from "vitest";

const pushSubscribe = vi.hoisted(() => vi.fn());
const pushUnsubscribe = vi.hoisted(() => vi.fn());
const pushVapidPublicKey = vi.hoisted(() => vi.fn());

vi.mock("@barrelsgd/api-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@barrelsgd/api-client")>()),
  pushSubscribe,
  pushUnsubscribe,
  pushVapidPublicKey,
}));
vi.mock("@/lib/env", () => ({ env: { AUTH_API_URL: "http://api.test" } }));
vi.mock("@/lib/visitor-client", () => ({
  visitorClient: () => Promise.resolve("visitor-client"),
}));

import { DELETE, GET, POST } from "./route";

const subscription = {
  endpoint: "https://fcm.googleapis.com/fcm/send/abc",
  keys: { p256dh: "BPubKeyAAAAAAAAAA", auth: "authsecretAAAA" },
};

function request(method: string, body: unknown) {
  return new Request("https://gms.example.test/api/alerts/push", {
    method,
    body: JSON.stringify(body),
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

const resolves = (value: unknown) => ({ unwrap: () => Promise.resolve(value) });
const rejects = (status: number) => ({
  unwrap: () => Promise.reject(responseError(status)),
});

beforeEach(() => {
  pushSubscribe.mockReset();
  pushUnsubscribe.mockReset();
  pushVapidPublicKey.mockReset();
});

describe("/api/alerts/push", () => {
  it("returns the public key when push is enabled", async () => {
    pushVapidPublicKey.mockReturnValue(
      resolves({ enabled: true, public_key: "pub" })
    );
    const response = await GET();
    expect(await response.json()).toEqual({ enabled: true, publicKey: "pub" });
  });

  it("reports disabled when FastAPI has no keys", async () => {
    pushVapidPublicKey.mockReturnValue(
      resolves({ enabled: false, public_key: null })
    );
    expect(await (await GET()).json()).toEqual({
      enabled: false,
      publicKey: null,
    });
  });

  it("subscribes a browser to the gms-alerts list", async () => {
    pushSubscribe.mockReturnValue(resolves({ message: "ok" }));
    const response = await POST(request("POST", subscription));
    expect(response.status).toBe(201);
    expect(pushSubscribe).toHaveBeenCalledWith({
      client: "visitor-client",
      body: { list_key: "gms-alerts", ...subscription },
    });
  });

  it("rejects a malformed subscription", async () => {
    const response = await POST(request("POST", { endpoint: "nope" }));
    expect(response.status).toBe(400);
    expect(pushSubscribe).not.toHaveBeenCalled();
  });

  it("maps FastAPI 503 to 503", async () => {
    pushSubscribe.mockReturnValue(rejects(503));
    expect((await POST(request("POST", subscription))).status).toBe(503);
  });

  it("unsubscribes by endpoint", async () => {
    pushUnsubscribe.mockReturnValue(resolves({ message: "ok" }));
    const response = await DELETE(
      request("DELETE", { endpoint: subscription.endpoint })
    );
    expect(response.status).toBe(200);
    expect(pushUnsubscribe).toHaveBeenCalledWith({
      client: "visitor-client",
      body: { endpoint: subscription.endpoint },
    });
  });
  it("maps rate limiting and rejected subscriptions", async () => {
    pushSubscribe.mockReturnValueOnce(rejects(429));
    expect((await POST(request("POST", subscription))).status).toBe(429);
    pushSubscribe.mockReturnValueOnce(rejects(422));
    expect((await POST(request("POST", subscription))).status).toBe(400);
  });

  it("lets unexpected FastAPI errors reach the error boundary", async () => {
    pushVapidPublicKey.mockReturnValue(rejects(500));
    await expect(GET()).rejects.toBeInstanceOf(ResponseError);
  });

  it("rejects an unsubscribe without an endpoint", async () => {
    expect((await DELETE(request("DELETE", {}))).status).toBe(400);
    expect(pushUnsubscribe).not.toHaveBeenCalled();
  });
});
