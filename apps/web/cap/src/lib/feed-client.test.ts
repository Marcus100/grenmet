import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createFeedClient } from "@/lib/feed-client";

const schema = z.object({ n: z.number() });

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function setup(responses: (Response | Error)[], clock = { t: 0 }) {
  const queue = [...responses];
  const fetchImpl = vi.fn(() => {
    const next = queue.shift();
    if (next instanceof Error) {
      return Promise.reject(next);
    }
    return Promise.resolve(next ?? json({}, 500));
  }) as unknown as typeof fetch;
  const onError = vi.fn();
  const client = createFeedClient({
    baseUrl: "http://api",
    fetchImpl,
    maxStaleMs: 1000,
    now: () => new Date(clock.t),
    onError,
  });
  return { client, clock, onError };
}

describe("feed client", () => {
  it("returns ok data with its fetch time", async () => {
    const { client } = setup([json({ n: 1 })]);
    expect(await client.get("/x", schema)).toEqual({
      data: { n: 1 },
      fetchedAt: new Date(0),
      status: "ok",
    });
  });

  it("serves last-known-good, flagged stale, when the API fails", async () => {
    const { client, onError } = setup([
      json({ n: 1 }),
      new Error("down"),
      json({}, 503),
    ]);
    await client.get("/x", schema);
    const failed = await client.get("/x", schema);
    expect(failed).toMatchObject({ data: { n: 1 }, status: "stale" });
    expect(await client.get("/x", schema)).toMatchObject({ status: "stale" });
    expect(onError).toHaveBeenCalledTimes(2);
  });

  it("is unavailable when nothing good was ever fetched", async () => {
    const { client } = setup([new Error("down")]);
    expect(await client.get("/x", schema)).toEqual({ status: "unavailable" });
  });

  it("drops last-known-good that is too old", async () => {
    const { client, clock } = setup([json({ n: 1 }), new Error("down")]);
    await client.get("/x", schema);
    clock.t = 5000;
    expect(await client.get("/x", schema)).toEqual({ status: "unavailable" });
  });

  it("treats a schema mismatch as a failure, not as data", async () => {
    const { client } = setup([json({ n: "no" })]);
    expect(await client.get("/x", schema)).toEqual({ status: "unavailable" });
  });

  it("reports 404 as not-found and never falls back", async () => {
    const { client } = setup([json({ n: 1 }), json({}, 404)]);
    await client.get("/x", schema);
    expect(await client.get("/x", schema)).toEqual({ status: "not-found" });
  });
});
