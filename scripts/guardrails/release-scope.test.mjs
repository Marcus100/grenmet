import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import {
  coreServices,
  releaseScope,
  validateComposeScope,
  validateReleaseConfiguration,
} from "../ci/release-scope.mjs";

test("release includes nine core images and rejects contradictory weather configuration", () => {
  assert.equal(releaseScope.web.length, 9);
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

const COMPOSE_SECTION_BOUNDARY = /\n\S/;
const COMPOSE_SERVICE_NAME = /^ {2}([a-z][a-z0-9-]*):/gm;

test("deployment scope accepts the services declared in the shared Compose stack", () => {
  const compose = readFileSync(
    new URL("../../infra/docker/docker-compose.deploy.yml", import.meta.url),
    "utf8"
  );
  const servicesBlock = compose
    .split("\nservices:\n")[1]
    ?.split(COMPOSE_SECTION_BOUNDARY)[0];
  assert.ok(servicesBlock);
  const services = Object.fromEntries(
    [...servicesBlock.matchAll(COMPOSE_SERVICE_NAME)].map((match) => [
      match[1],
      {},
    ])
  );
  assert.ok(Object.hasOwn(services, "nhc-worker"));
  validateComposeScope({ services });
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
