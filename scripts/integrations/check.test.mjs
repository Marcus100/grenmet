import assert from "node:assert/strict";
import test from "node:test";
import { checkProviders, main, providerChecks } from "./check.mjs";

test("missing credentials never issue requests or imply verification", async () => {
  const reports = await checkProviders(
    {},
    {
      live: true,
      fetcher: () => {
        throw new Error("must not fetch");
      },
    }
  );
  assert.equal(reports.length, 6);
  assert.ok(reports.every((r) => r.status === "missing"));
});

test("live checks use read-only requests, reject redirects and hide provider responses", async () => {
  const env = Object.fromEntries(
    providerChecks({}).flatMap((p) =>
      p.keys.map((k) => [k, "sensitive-canary"])
    )
  );
  const requests = [];
  const reports = await checkProviders(env, {
    live: true,
    fetcher: (url, options) => {
      requests.push({ url, options });
      return Promise.resolve(new Response("sensitive-canary", { status: 200 }));
    },
  });
  assert.equal(requests.length, 6);
  assert.ok(
    requests.every(
      (r) => r.options.method === "GET" && r.options.redirect === "error"
    )
  );
  assert.ok(reports.every((r) => r.status === "read-access-verified"));
  assert.ok(!JSON.stringify(reports).includes("sensitive-canary"));
});

test("credential presence is distinct from delivery or access verification", async () => {
  const reports = await checkProviders({ DIGITALOCEAN_ACCESS_TOKEN: "secret" });
  assert.equal(
    reports.find((r) => r.provider === "DigitalOcean").status,
    "configured-unverified"
  );
});

test("network errors never leak request headers", async () => {
  const reports = await checkProviders(
    { DIGITALOCEAN_ACCESS_TOKEN: "secret" },
    {
      live: true,
      fetcher: () => {
        throw new Error("secret");
      },
    }
  );
  assert.equal(
    reports.find((r) => r.provider === "DigitalOcean").status,
    "request-failed"
  );
  assert.ok(!JSON.stringify(reports).includes("secret"));
});

const ENVIRONMENT_ERROR = /environment/;

test("requires explicit environment selection", async () => {
  await assert.rejects(main([]), ENVIRONMENT_ERROR);
});

test("does not forward self-hosted PostHog credentials to the hosted service", async () => {
  const reports = await checkProviders(
    {
      NEXT_PUBLIC_POSTHOG_HOST: "https://private.example.test",
      POSTHOG_PERSONAL_API_KEY: "secret",
      POSTHOG_PROJECT_ID: "1",
    },
    {
      live: true,
      fetcher: () => {
        throw new Error("must not fetch");
      },
    }
  );
  assert.equal(
    reports.find((r) => r.provider === "PostHog").status,
    "unsupported-host"
  );
});
