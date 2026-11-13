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
  routedServices,
  validateAdminHosts,
  validateComposeScope,
  validateReleaseConfiguration,
  webImages,
} from "../ci/release-scope.mjs";

const PROMOTE_NEEDS = /needs: \[release-scope, promote(, scan)?\]/u;
const ROLLING_REPLACEMENT = /rolling replacement/u;
const CHECK_SCRIPT = fileURLToPath(
  new URL("../ci/check-release-scope.mjs", import.meta.url)
);

const MORE_THAN_ONE_SERVICE = /more than one service/u;

test("release includes fourteen core images and rejects contradictory weather configuration", () => {
  assert.equal(releaseScope.web.length, 14);
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
    // Staging also waits for the rescan of promoted digests (issue #1142).
    assert.match(yaml, PROMOTE_NEEDS);
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

const LEGACY_ENV_LABEL = /gd\.barrels\.environment/u;
const BUILD_ENVIRONMENT = /^ {4}environment: build$/mu;
const WORKFLOW_DISPATCH = /^ {2}workflow_dispatch:/mu;
const LEGACY_TAGS = /options:\n\s+- staging|build-once=\$\{\{ inputs\.tag/u;
test("image builds are dev-only, use the build environment and require a Sentry DSN", () => {
  const web = readFileSync(
    new URL("../../.github/workflows/build-web-images.yml", import.meta.url),
    "utf8"
  );
  const api = readFileSync(
    new URL("../../.github/workflows/build-api-image.yml", import.meta.url),
    "utf8"
  );
  assert.match(web, BUILD_ENVIRONMENT);
  for (const workflow of [web, api]) {
    // Only dev-images.yml starts builds; no staging/latest dispatch remains.
    assert.doesNotMatch(workflow, WORKFLOW_DISPATCH);
    assert.doesNotMatch(workflow, LEGACY_TAGS);
    assert.doesNotMatch(workflow, LEGACY_ENV_LABEL);
    assert.ok(workflow.includes("gd.barrels.tree="));
    assert.ok(workflow.includes("org.opencontainers.image.revision="));
  }
  const step = web.slice(
    web.indexOf("- name: Require the build-time Sentry DSN")
  );
  assert.ok(step.startsWith("- name:"));
  assert.ok(step.slice(0, 900).includes("exit 1"));
  assert.ok(step.includes("SENTRY_DSN_PRODUCTION"));
});

const SITE_URL_ARG = /NEXT_PUBLIC_SITE_URL=(.+)$/gmu;
const DOMAIN_ROW =
  /^\| [^|]+ \| (\d{4}) \| (https:\/\/[a-z.]+)[^|]*\| (https:\/\/[a-z.]+)?/gmu;

// Staging's address is supplied at run time (docker-compose.deploy.yml); the
// image build only seeds the production address.
test("each web image is built with the production address in docs/deployment.md", () => {
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
    for (const environment of ["production"]) {
      if (!expected[environment]) continue;
      const url = templates[0].replace(/\$\{\{(.+?)\}\}/gu, (_, expression) =>
        runInNewContext(expression, {
          matrix: image,
          steps: { ctx: { outputs: { environment } } },
        })
      );
      assert.equal(url, expected[environment], `${image.app} ${environment}`);
      checked += 1;
    }
  }
  assert.ok(checked >= 5, `only ${checked} addresses checked`);
});

test("routed services can run twice during a rolling start", () => {
  assert.ok(routedServices.includes("api"));
  assert.equal(routedServices.includes("proxy"), false);
  assert.equal(routedServices.includes("worker"), false);
  for (const service of routedServices)
    assert.ok(appServices.includes(service));
  const services = Object.fromEntries(
    coreServices.map((service) => [service, {}])
  );
  for (const blocker of [
    { ports: ["3000:3000"] },
    { container_name: "pinned" },
  ])
    assert.throws(
      () =>
        validateComposeScope({
          services: { ...services, "web-auth": blocker },
        }),
      ROLLING_REPLACEMENT
    );
  // The proxy publishes 80/443 and is not rolled, so its ports are allowed.
  validateComposeScope({
    services: { ...services, proxy: { ports: ["443:443"] } },
  });
});

const adminModel = (consoleHost, portalRule) => ({
  services: {
    "web-admin": {
      labels: {
        "traefik.http.routers.web-barrels-admin-staging.rule": `Host(\`${consoleHost}\`)`,
      },
    },
    "web-gmsadmin": {
      labels: {
        "traefik.http.routers.web-gms-portal-staging.rule": portalRule,
      },
    },
  },
});

test("admin console and portal hosts must be present and distinct", () => {
  validateAdminHosts(
    adminModel("admin.staging.barrels.gd", "Host(`gms.staging.barrels.gd`)")
  );
  for (const [host, rule] of [
    ["admin.barrels.gd", "Host(`admin.barrels.gd`)"],
    ["admin.barrels.gd", "Host(`gms.barrels.gd`) || Host(`admin.barrels.gd`)"],
    ["", "Host(`gms.barrels.gd`)"],
    ["admin", "Host(`gms.barrels.gd`)"],
  ])
    assert.throws(() => validateAdminHosts(adminModel(host, rule)));
  assert.throws(() => validateAdminHosts({ services: {} }));
});

test("no other router or service may use the console or portal host", () => {
  const base = adminModel(
    "admin.staging.barrels.gd",
    "Host(`gms.staging.barrels.gd`)"
  );
  const withLabels = (service, labels) => ({
    services: {
      ...base.services,
      [service]: {
        ...base.services[service],
        labels: { ...base.services[service]?.labels, ...labels },
      },
    },
  });
  // A second router on another service reusing either host.
  for (const host of ["admin.staging.barrels.gd", "gms.staging.barrels.gd"])
    assert.throws(
      () =>
        validateAdminHosts(
          withLabels("web-docs", {
            "traefik.http.routers.extra.rule": `Host(\`${host}\`) && PathPrefix(\`/x\`)`,
          })
        ),
      MORE_THAN_ONE_SERVICE
    );
  // A second router on the console itself would make it answer another host.
  assert.throws(() =>
    validateAdminHosts(
      withLabels("web-admin", {
        "traefik.http.routers.extra.rule": "Host(`other.staging.barrels.gd`)",
      })
    )
  );
  // Extra routers on the portal are fine while the hosts stay distinct.
  validateAdminHosts(
    withLabels("web-gmsadmin", {
      "traefik.http.routers.alias.rule": "Host(`alias.staging.barrels.gd`)",
    })
  );
});

test("every web image resolves a build-time Sentry DSN, or is deliberately unrouted", async () => {
  const { buildConfig } = await import("../integrations/build-config.mjs");
  const unrouted = [];
  for (const image of webImages) {
    const app = image.path.split("/").pop();
    const config = buildConfig(app, "production", undefined, {
      SENTRY_DSN_PRODUCTION: "https://key@example.ingest.sentry.io/1",
    });
    if (config.sentry_project === "") {
      // The workflow gate skips apps without a Sentry project.
      assert.equal(
        config.sentry_dsn,
        "",
        `${image.image} has a DSN but no project`
      );
      unrouted.push(image.image);
    } else {
      assert.ok(config.sentry_dsn, `${image.image} would fail the DSN gate`);
    }
  }
  // admin is intentionally not routed to Sentry yet (service catalogue).
  assert.deepEqual(unrouted, ["web-admin"]);
});
