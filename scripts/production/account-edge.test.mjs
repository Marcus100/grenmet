// Checks the account web service in the deploy compose file, its release
// scope entry, its service-catalogue origins and its port row in docs/ports.md.
// Compose is read as text (no YAML parser is in the catalogue), the same way
// scripts/ci/check-ports.mjs reads it.
// Run: node --test scripts/production/account-edge.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { checkPorts } from "../ci/check-ports.mjs";
import { appServices, webImages } from "../ci/release-scope.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, "utf8");
const compose = read("infra/docker/docker-compose.deploy.yml");
const catalogue = JSON.parse(
  read("packages/ui/src/lib/service-catalogue.json")
);

const IMAGE =
  /image: ghcr\.io\/\$\{GHCR_OWNER\}\/barrelsgd-web-account:\$\{WEB_TAG\}/u;
const RESTART = /restart: always/u;
const LOGGING = /logging: \*bounded-logging/u;
const HEALTHCHECK = /fetch\('http:\/\/127\.0\.0\.1:3018\/api\/health'\)/u;
const ROUTER_RULE =
  /traefik\.http\.routers\.web-account\$\{ROUTER_SUFFIX\}\.rule=Host\(`account\.\$\{BASE_DOMAIN\}`\)/u;
const ROUTER_ENTRY =
  /traefik\.http\.routers\.web-account\$\{ROUTER_SUFFIX\}\.entrypoints=websecure/u;
const ROUTER_TLS =
  /traefik\.http\.routers\.web-account\$\{ROUTER_SUFFIX\}\.tls\.certresolver=letsencrypt/u;
const SERVICE_PORT =
  /traefik\.http\.services\.web-account\$\{ROUTER_SUFFIX\}\.loadbalancer\.server\.port=3018/u;
const PORTS_KEY = /^\s{4}ports:/mu;
const CONTAINER_NAME = /^\s{4}container_name:/mu;
const NETWORKS = /^ {4}networks:\n {6}- grenmet$/mu;
const ACCOUNT_HOST = /Host\(`account\./gu;
const SSO_SECRET =
  /ACCOUNT_SSO_CLIENT_SECRET: \$\{ACCOUNT_SSO_CLIENT_SECRET:-\}/u;
const SENTRY_DSN = /NEXT_PUBLIC_SENTRY_DSN: \$\{SENTRY_DSN_ACCOUNT:-\}/u;
const API_ACCOUNT_URL =
  /ACCOUNT_APP_URL: https:\/\/account\.\$\{BASE_DOMAIN\}/u;
const AUTH_URL = /AUTH_API_URL: http:\/\/api:8000/u;
const SERVICE_START = /^ {2}\S/u;

/** The text of one top-level service (two-space indent), up to the next one. */
function serviceBlock(name) {
  const lines = compose.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `${name} is missing from the deploy compose file`);
  let end = lines.length;
  for (let i = start + 1; i < lines.length; i++) {
    if (SERVICE_START.test(lines[i])) {
      end = i;
      break;
    }
  }
  return lines.slice(start, end).join("\n");
}

const block = serviceBlock("web-account");

test("the API service is told the account URL and the optional SSO secret", () => {
  const api = serviceBlock("api");
  assert.match(api, API_ACCOUNT_URL);
  assert.match(api, SSO_SECRET);
});

test("web-account runs the account image on port 3018", () => {
  assert.match(block, IMAGE);
  assert.match(block, RESTART);
  assert.match(block, LOGGING);
  assert.match(
    block,
    HEALTHCHECK,
    "healthcheck must probe the container's own /api/health on 3018"
  );
});

test("web-account routes account.<base domain> through Traefik", () => {
  assert.match(block, ROUTER_RULE);
  assert.match(block, ROUTER_ENTRY);
  assert.match(block, ROUTER_TLS);
  assert.match(block, SERVICE_PORT);
});

test("web-account is a rolling, routed service: no host ports or container name", () => {
  assert.doesNotMatch(block, PORTS_KEY);
  assert.doesNotMatch(block, CONTAINER_NAME);
  assert.match(block, NETWORKS);
});

test("the account host is claimed only by web-account", () => {
  const hosts = compose.match(ACCOUNT_HOST) ?? [];
  assert.equal(hosts.length, 1);
});

test("sign-in secret is optional and Sentry uses the catalogue secret name", () => {
  assert.match(block, SSO_SECRET);
  assert.match(block, SENTRY_DSN);
  assert.match(block, AUTH_URL);
});

test("release scope builds and deploys account like its siblings", () => {
  const image = webImages.find((entry) => entry.app === "account");
  assert.ok(image, "account is missing from scripts/ci/release-scope.mjs");
  assert.equal(image.image, "web-account");
  assert.equal(image.path, "apps/web/account");
  assert.equal(image.port, 3018);
  assert.ok(appServices.includes("web-account"));
});

test("catalogue origins match the deployed hostnames", () => {
  const service = catalogue.services.find((entry) => entry.id === "account");
  assert.ok(service, "account is missing from the service catalogue");
  assert.equal(
    service.environments.production.origin,
    "https://account.barrels.gd"
  );
  assert.equal(
    service.environments.staging.origin,
    "https://account.staging.barrels.gd"
  );
  assert.equal(
    service.environments.development.origin,
    "http://localhost:3018"
  );
  assert.equal(service.healthPath, "/api/health");
});

test("docs/ports.md, release scope and compose agree on every web port", async () => {
  assert.deepEqual(await checkPorts(root), []);
});
