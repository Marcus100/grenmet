const FORBIDDEN = /403/;
const TOKEN_REQUIRED = /ACCESS_TOKEN/;
const LOCAL_API = /local FastAPI/;

import assert from "node:assert/strict";
import test from "node:test";
import { publishLocalForecasts } from "./publish-local-forecasts.mjs";

test("local publishing requires an authorized local API", async () => {
  await assert.rejects(
    publishLocalForecasts("2026-09-17", {
      baseUrl: "https://api.example.test",
      accessToken: "test",
    }),
    LOCAL_API
  );
  await assert.rejects(
    publishLocalForecasts("2026-09-17", { baseUrl: "http://localhost:8000" }),
    TOKEN_REQUIRED
  );
});
test("fixtures publish via the API without supplying audit identity", async (t) => {
  const calls = [];
  t.mock.method(globalThis, "fetch", (url, options) => {
    calls.push({ url, options });
    return Response.json(
      url.pathname.endsWith("/preview")
        ? {
            errors: [],
            values: {
              ...JSON.parse(options.body).values,
              summary: "Backend normalized",
            },
          }
        : options.method === "POST"
          ? { revision: 1 }
          : { products: [] }
    );
  });
  t.mock.method(console, "log", () => {
    /* Silence fixture progress in tests. */
  });
  await publishLocalForecasts("2026-09-17", {
    baseUrl: "http://localhost:8000",
    accessToken: "test-only",
  });
  assert.equal(calls.length, 9);
  for (const { options } of calls.filter(
    ({ url, options }) =>
      options.method === "POST" && !url.pathname.endsWith("/preview")
  )) {
    assert.equal(options.headers.Authorization, "Bearer test-only");
    const body = JSON.parse(options.body);
    assert.equal(body.action, "publish");
    assert.equal(body.values.summary, "Backend normalized");
    assert.equal(body.expectedRevision, 0);
    assert.equal(body.actorId, undefined);
  }
});
test("refuses an API denial instead of writing directly", async (t) => {
  t.mock.method(
    globalThis,
    "fetch",
    async () => new Response(null, { status: 403 })
  );
  await assert.rejects(
    publishLocalForecasts("2026-09-17", {
      baseUrl: "http://localhost:8000",
      accessToken: "test-only",
    }),
    FORBIDDEN
  );
});

for (const scenario of [
  "validation errors",
  "preview denial",
  "invalid preview",
]) {
  test(`does not publish after ${scenario}`, async (t) => {
    const writes = [];
    t.mock.method(globalThis, "fetch", (url, options) => {
      if (options.method !== "POST") return Response.json({ products: [] });
      if (url.pathname.endsWith("/preview")) {
        if (scenario === "preview denial")
          return new Response(null, { status: 403 });
        if (scenario === "invalid preview")
          return Response.json({ values: {} });
        return Response.json({
          errors: ["An expired product cannot be published"],
          values: {},
        });
      }
      writes.push(options);
      return Response.json({ revision: 1 });
    });
    await assert.rejects(
      publishLocalForecasts("2026-09-17", {
        baseUrl: "http://localhost:8000",
        accessToken: "test-only",
      })
    );
    assert.equal(writes.length, 0);
  });
}
