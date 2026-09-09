import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  releaseScope,
  validateReleaseConfiguration,
} from "../ci/release-scope.mjs";

test("release includes twelve core images and rejects contradictory weather configuration", () => {
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

test("deployment rejects a missing core service or an extra deferred service", async () => {
  const { coreServices, validateComposeScope } = await import(
    "../ci/release-scope.mjs"
  );
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
        steps: { ctx: { outputs: { environment } } },
        secrets: {
          SENTRY_DSN_STAGING: "",
          SENTRY_DSN_PRODUCTION: "production-only",
        },
      };
      assert.equal(
        runInNewContext(expression, context),
        expected === "staging" ? "" : "production-only"
      );
      context.secrets.SENTRY_DSN_STAGING = "staging-only";
      assert.equal(
        runInNewContext(expression, context),
        expected === "staging" ? "staging-only" : "production-only"
      );
    }
  }
});
