import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import {
  appServices,
  coreServices,
  dataServices,
  migrationServices,
  releaseScope,
  validateComposeScope,
  validateReleaseConfiguration,
  webImages,
} from "../ci/release-scope.mjs";

const CHECK_SCRIPT = fileURLToPath(
  new URL("../ci/check-release-scope.mjs", import.meta.url)
);

test("release includes eleven core images and rejects contradictory weather configuration", () => {
  assert.equal(releaseScope.web.length, 11);
  assert.equal(releaseScope.api, true);
  assert.deepEqual(releaseScope.weather, []);
  validateReleaseConfiguration({});
  validateReleaseConfiguration({ WEATHER_STAGING_ENABLED: "false" });
  for (const key of ["WEATHER_STAGING_ENABLED", "WEATHER_PRODUCTION_ENABLED"])
    for (const value of ["true", "TRUE", "1"])
      assert.throws(() => validateReleaseConfiguration({ [key]: value }));
});
test("promotion pipelines require scope validation and cannot invoke deferred delivery", () => {
  for (const file of ["pipeline-staging.yml", "pipeline-prod.yml"]) {
    const yaml = readFileSync(
      new URL(`../../.github/workflows/${file}`, import.meta.url),
      "utf8"
    );
    assert.ok(
      yaml.includes(
        "needs: [release-scope, ci-api, ci-web, api-client, build-api, build-web]"
      )
    );
    assert.ok(yaml.includes("node scripts/ci/check-release-scope.mjs"));
    assert.equal(yaml.includes("build-weather-images.yml"), false);
    assert.equal(yaml.includes("deploy-weather.yml"), false);
  }
});

test("deployment rejects a missing core service or an extra deferred service", () => {
  const services = Object.fromEntries(
    coreServices.map((service) => [service, {}])
  );
  validateComposeScope({ services });
  for (const service of coreServices) {
    const missing = { ...services };
    delete missing[service];
    assert.throws(() => validateComposeScope({ services: missing }));
  }
  for (const service of [
    "surface",
    "wis2box",
    "wxwatch",
    "gms-ingest",
    "geonetcast",
  ])
    assert.throws(() =>
      validateComposeScope({ services: { ...services, [service]: {} } })
    );
});

test("service roles partition the core services and drive the CLI", () => {
  const roles = {
    data: dataServices,
    migration: migrationServices,
    app: appServices,
  };
  const all = [...dataServices, ...migrationServices, ...appServices];
  assert.equal(new Set(all).size, all.length, "a service has two roles");
  assert.deepEqual([...all].sort(), [...coreServices].sort());
  for (const service of ["api", "worker", "nhc-worker", "proxy"])
    assert.ok(appServices.includes(service));
  for (const [role, services] of Object.entries(roles)) {
    const printed = execFileSync(
      process.execPath,
      [CHECK_SCRIPT, "--print", role],
      { encoding: "utf8" }
    );
    assert.deepEqual(printed.trim().split(" "), services);
  }
  assert.throws(() =>
    execFileSync(process.execPath, [CHECK_SCRIPT, "--print", "bogus"], {
      stdio: "pipe",
    })
  );
});

const ENVIRONMENT_EXPRESSION = /^ {4}environment: \$\{\{ (.+) \}\}$/m;
const SENTRY_EXPRESSION = /NEXT_PUBLIC_SENTRY_DSN=\$\{\{ (.+) \}\}/g;
test("build environment and Sentry selection keep staging isolated when its key is missing", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/build-web-images.yml", import.meta.url),
    "utf8"
  );
  const environmentExpression = workflow.match(ENVIRONMENT_EXPRESSION)?.[1];
  assert.ok(environmentExpression);
  const sentryExpressions = [...workflow.matchAll(SENTRY_EXPRESSION)].map(
    (match) => match[1]
  );
  assert.equal(sentryExpressions.length, 2);
  for (const [tag, ref, event, expected] of [
    ["staging", "dev", "workflow_dispatch", "staging"],
    ["", "staging", "push", "staging"],
    ["latest", "main", "workflow_dispatch", "production"],
    ["", "main", "release", "production"],
  ]) {
    const environment = runInNewContext(environmentExpression, {
      inputs: { tag },
      github: { ref_name: ref, event_name: event },
    });
    assert.equal(environment, expected);
    for (const expression of sentryExpressions) {
      const context = {
        steps: {
          ctx: { outputs: { environment } },
          telemetry: { outputs: { sentry_dsn: "" } },
        },
        secrets: {
          SENTRY_DSN_STAGING: "",
          SENTRY_DSN_PRODUCTION: "production-only",
        },
      };
      assert.equal(runInNewContext(expression, context), "");
      context.steps.telemetry.outputs.sentry_dsn = `${environment}-app-only`;
      assert.equal(
        runInNewContext(expression, context),
        `${environment}-app-only`
      );
    }
  }
});

const SITE_URL_ARG = /NEXT_PUBLIC_SITE_URL=(.+)$/gm;
const DOMAIN_ROW =
  /^\| [^|]+ \| (\d{4}) \| (https:\/\/[a-z.]+)[^|]*\| (https:\/\/[a-z.]+)?/gm;

test("each web image is built with the public address in docs/deployment.md", () => {
  const workflow = readFileSync(
    new URL("../../.github/workflows/build-web-images.yml", import.meta.url),
    "utf8"
  );
  const templates = [...workflow.matchAll(SITE_URL_ARG)].map((m) =>
    m[1].trim()
  );
  assert.equal(templates.length, 2);
  assert.equal(templates[0], templates[1]);
  const deployment = readFileSync(
    new URL("../../docs/deployment.md", import.meta.url),
    "utf8"
  );
  const documented = new Map(
    [...deployment.matchAll(DOMAIN_ROW)].map((m) => [
      Number(m[1]),
      { production: m[2], staging: m[3] },
    ])
  );
  let checked = 0;
  for (const image of webImages) {
    const expected = documented.get(image.port);
    if (!expected) continue;
    for (const environment of ["production", "staging"]) {
      if (!expected[environment]) continue;
      const url = templates[0].replace(/\$\{\{(.+?)\}\}/g, (_, expression) =>
        runInNewContext(expression, {
          matrix: image,
          steps: { ctx: { outputs: { environment } } },
        })
      );
      assert.equal(url, expected[environment], `${image.app} ${environment}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 10, `only ${checked} addresses checked`);
});
