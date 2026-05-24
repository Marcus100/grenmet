import { describe, expect, it } from "vitest";
import { createApp } from "../app.js";

describe("GET /health", () => {
  it("returns 200 with status ok", async () => {
    const app = createApp();
    const res = await app.request("/health");

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toMatchObject({ status: "ok", service: "api-hono" });
  });

  it("responds to HEAD /health", async () => {
    const app = createApp();
    const res = await app.request("/health", { method: "HEAD" });
    expect(res.status).toBe(200);
  });
});

describe("404 fallback", () => {
  it("returns 404 for unknown routes", async () => {
    const app = createApp();
    const res = await app.request("/does-not-exist");
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body).toMatchObject({ error: "Not found" });
  });
});
