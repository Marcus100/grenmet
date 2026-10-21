// Checks the bookings web service in the deploy compose file, its release
// scope entry, its service-catalogue origins and its port row in docs/ports.md.
// Compose is read as text (no YAML parser is in the catalogue), the same way
// scripts/ci/check-ports.mjs reads it.
// Run: node --test scripts/production/bookings-edge.test.mjs
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
  /image: ghcr\.io\/\$\{GHCR_OWNER\}\/barrelsgd-web-bookings:\$\{WEB_TAG\}/;
const RESTART = /restart: always/;
const LOGGING = /logging: \*bounded-logging/;
const HEALTHCHECK = /fetch\('http:\/\/127\.0\.0\.1:3015\/api\/health'\)/;
const ROUTER_RULE =
  /traefik\.http\.routers\.web-bookings\$\{ROUTER_SUFFIX\}\.rule=Host\(`bookings\.\$\{BASE_DOMAIN\}`\)/;
const ROUTER_ENTRY =
  /traefik\.http\.routers\.web-bookings\$\{ROUTER_SUFFIX\}\.entrypoints=websecure/;
const ROUTER_TLS =
  /traefik\.http\.routers\.web-bookings\$\{ROUTER_SUFFIX\}\.tls\.certresolver=letsencrypt/;
const SERVICE_PORT =
  /traefik\.http\.services\.web-bookings\$\{ROUTER_SUFFIX\}\.loadbalancer\.server\.port=3015/;
const PORTS_KEY = /^\s{4}ports:/m;
const CONTAINER_NAME = /^\s{4}container_name:/m;
const NETWORKS = /^ {4}networks:\n {6}- grenmet$/m;
const BOOKINGS_HOST = /Host\(`bookings\./g;
const SSO_SECRET =
  /BOOKINGS_SSO_CLIENT_SECRET: \$\{BOOKINGS_SSO_CLIENT_SECRET:-\}/;
const SENTRY_DSN = /NEXT_PUBLIC_SENTRY_DSN: \$\{SENTRY_DSN_BOOKINGS:-\}/;
const API_BOOKINGS_URL =
  /BOOKINGS_APP_URL: https:\/\/bookings\.\$\{BASE_DOMAIN\}/;
const AUTH_URL = /AUTH_API_URL: http:\/\/api:8000/;
const SERVICE_START = /^ {2}\S/;

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

const block = serviceBlock("web-bookings");

test("the API service is told the bookings URL and the optional SSO secret", () => {
  const api = serviceBlock("api");
  assert.match(api, API_BOOKINGS_URL);
  assert.match(api, SSO_SECRET);
});

test("web-bookings runs the bookings image on port 3015", () => {
  assert.match(block, IMAGE);
  assert.match(block, RESTART);
  assert.match(block, LOGGING);
  assert.match(
    block,
    HEALTHCHECK,
    "healthcheck must probe the container's own /api/health on 3015"
  );
});

test("web-bookings routes bookings.<base domain> through Traefik", () => {
  assert.match(block, ROUTER_RULE);
  assert.match(block, ROUTER_ENTRY);
  assert.match(block, ROUTER_TLS);
  assert.match(block, SERVICE_PORT);
});

test("web-bookings is a rolling, routed service: no host ports or container name", () => {
  assert.doesNotMatch(block, PORTS_KEY);
  assert.doesNotMatch(block, CONTAINER_NAME);
  assert.match(block, NETWORKS);
});

test("the bookings host is claimed only by web-bookings", () => {
  const hosts = compose.match(BOOKINGS_HOST) ?? [];
  assert.equal(hosts.length, 1);
});

test("sign-in secret is optional and Sentry uses the catalogue secret name", () => {
  assert.match(block, SSO_SECRET);
  assert.match(block, SENTRY_DSN);
  assert.match(block, AUTH_URL);
});

test("release scope builds and deploys bookings like its siblings", () => {
  const image = webImages.find((entry) => entry.app === "bookings");
  assert.ok(image, "bookings is missing from scripts/ci/release-scope.mjs");
  assert.equal(image.image, "web-bookings");
  assert.equal(image.path, "apps/web/bookings");
  assert.equal(image.port, 3015);
  assert.ok(appServices.includes("web-bookings"));
});

test("catalogue origins match the deployed hostnames", () => {
  const service = catalogue.services.find((entry) => entry.id === "bookings");
  assert.ok(service, "bookings is missing from the service catalogue");
  assert.equal(
    service.environments.production.origin,
    "https://bookings.barrels.gd"
  );
  assert.equal(
    service.environments.staging.origin,
    "https://bookings.staging.barrels.gd"
  );
  assert.equal(
    service.environments.development.origin,
    "http://localhost:3015"
  );
  assert.equal(service.healthPath, "/api/health");
});

test("docs/ports.md, release scope and compose agree on every web port", async () => {
  assert.deepEqual(await checkPorts(root), []);
});
