import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

// Every web app deployed from a Docker image serves its own /runtime-env.js
// (issue #1019). Elections (Vercel) is intentionally not wired: it is not built
// into a shared image and keeps build-time settings.
const APPS = [
  "admin",
  "auth",
  "bookings",
  "cap",
  "cms",
  "docs",
  "events",
  "gaa-admin",
  "gms",
  "gmsdash",
  "mbia",
  "signal",
];
const EXCEPTIONS = ["elections"];
// Apps whose proxy guards (almost) every path must let the script through.
const GUARDING_PROXIES = ["admin", "bookings", "gaa-admin", "gmsdash"];

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const LAYOUT_SCRIPT = /<PublicEnvScript \/>/;
const PUBLIC_ENV_RESPONSE = /publicEnvResponse/;
const PROXY_EXCLUSION = /runtime-env\\+\.js/;

test("every Docker-deployed web app serves /runtime-env.js and loads it", () => {
  for (const app of APPS) {
    const route = `apps/web/${app}/src/app/runtime-env.js/route.ts`;
    assert.ok(existsSync(new URL(`../../${route}`, import.meta.url)), route);
    assert.match(read(route), PUBLIC_ENV_RESPONSE, route);
    const layouts = [
      `apps/web/${app}/src/app/layout.tsx`,
      `apps/web/${app}/src/app/(payload)/layout.tsx`,
    ].filter((file) => existsSync(new URL(`../../${file}`, import.meta.url)));
    assert.ok(
      layouts.some((file) => LAYOUT_SCRIPT.test(read(file))),
      `${app}: root layout renders <PublicEnvScript />`
    );
  }
});

test("guarding proxies exclude /runtime-env.js", () => {
  for (const app of GUARDING_PROXIES) {
    assert.match(read(`apps/web/${app}/src/proxy.ts`), PROXY_EXCLUSION, app);
  }
});

test("elections is the only documented exception", () => {
  for (const app of EXCEPTIONS) {
    assert.equal(
      existsSync(
        new URL(
          `../../apps/web/${app}/src/app/runtime-env.js/route.ts`,
          import.meta.url
        )
      ),
      false
    );
    assert.ok(
      read("docs/env.md").includes(`\`${app}\``) ||
        read("docs/env.md").includes("Elections")
    );
  }
});

const EMPTY_PROJECT_LIST = /SENTRY_PROJECT\?\.split/;

test("an unset SENTRY_PROJECT stays undefined, never an empty project list", () => {
  // Sentry's build plugin fails on `project: []` (broke every image build).
  for (const app of APPS) {
    const config = read(`apps/web/${app}/next.config.ts`);
    assert.doesNotMatch(config, EMPTY_PROJECT_LIST, app);
    if (config.includes("SENTRY_PROJECT.split"))
      assert.ok(config.includes(": undefined"), app);
  }
});
