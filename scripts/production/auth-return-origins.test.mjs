// Every app that signs in through the shared auth app must be a valid sign-in
// return target in the deploy compose file. The auth app accepts only exact
// origins (ADR-0043 decision 5): a leading-dot entry such as ".staging.barrels.gd"
// is ignored, and only the app-URL variables listed in
// apps/web/auth/src/lib/return-to.ts are honoured without being named. An app
// that is in neither place signs the user in and then lands them on the auth
// home page instead of back in the app.
//
// Compose is read as text (no YAML parser is in the catalogue), the same way
// bookings-edge.test.mjs reads it.
// Run: node --test scripts/production/auth-return-origins.test.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../../", import.meta.url));
const read = (path) => readFileSync(`${root}${path}`, "utf8");
const compose = read("infra/docker/docker-compose.deploy.yml");
const returnTo = read("apps/web/auth/src/lib/return-to.ts");

const SERVICE_START = /^ {2}\S/u;
const APP_URL_LINE = /^\s+([A-Z][A-Z_]*_APP_URL): (https:\/\/\S+)\s*$/gmu;
const CONFIGURED_LIST = /const configured = \[([\s\S]*?)\];/u;
const ENV_NAME = /env\.([A-Z][A-Z_]*_APP_URL)/gu;
const RETURN_HOSTS = /^\s+AUTH_ALLOWED_RETURN_HOSTS: (.+)$/mu;
const EXTRA_HOSTS = /\$\{EXTRA_RETURN_HOSTS:-\}/u;
const HTTPS_ORIGIN = /^https:\/\//u;
// One label under the base domain: no port, path, query or other host.
const NAMED_ORIGIN = /^https:\/\/[a-z0-9-]+\.\$\{BASE_DOMAIN\}$/u;
const BASE_DOMAIN_REF = /\$\{BASE_DOMAIN\}/gu;
const STAGING_DOMAIN = "staging.barrels.gd";
// The hand-written staging configuration in the auth app's unit test.
const FIXTURE_HOSTS = /const STAGING = \{[\s\S]*?hosts:\s*"([^"]+)"/u;
const UNIT_TEST = "apps/web/auth/src/test/return-to.test.ts";

/** The text of one top-level service (two-space indent), up to the next one. */
function service(name) {
  const lines = compose.split("\n");
  const start = lines.indexOf(`  ${name}:`);
  assert.notEqual(start, -1, `service ${name} not found`);
  const end = lines.findIndex(
    (line, index) => index > start && SERVICE_START.test(line)
  );
  return lines.slice(start, end === -1 ? undefined : end).join("\n");
}

function appUrls(text) {
  return [...text.matchAll(APP_URL_LINE)].map(([, name, origin]) => [
    name,
    origin,
  ]);
}

/** Origins the auth app accepts without being named in AUTH_ALLOWED_RETURN_HOSTS. */
function honouredOrigins() {
  const list = returnTo.match(CONFIGURED_LIST);
  assert.ok(
    list,
    "return-to.ts no longer has a `configured` list; update this test"
  );
  const names = new Set([...list[1].matchAll(ENV_NAME)].map((m) => m[1]));
  const own = new Map(appUrls(service("web-auth")));
  return new Set([...names].map((name) => own.get(name)).filter(Boolean));
}

function explicitEntries() {
  const value = service("web-auth").match(RETURN_HOSTS)?.[1];
  assert.ok(value, "web-auth has no AUTH_ALLOWED_RETURN_HOSTS");
  return value
    .replace(EXTRA_HOSTS, "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

test("AUTH_ALLOWED_RETURN_HOSTS has no leading-dot or wildcard entry the auth app would ignore", () => {
  for (const entry of explicitEntries()) {
    assert.ok(
      !(entry.startsWith(".") || entry.includes("*")),
      `${entry} is ignored by return-to.ts; name each origin exactly`
    );
    assert.match(entry, HTTPS_ORIGIN, `${entry} must be an https origin`);
  }
});

test("every app in the API registry is a valid sign-in return target", () => {
  const registry = appUrls(service("api")).filter(
    ([name]) => name !== "AUTH_APP_URL"
  );
  assert.ok(registry.length >= 10, "expected the API app registry in compose");
  const allowed = new Set([...honouredOrigins(), ...explicitEntries()]);
  const refused = registry
    .filter(([, origin]) => !allowed.has(origin))
    .map(([name, origin]) => `${name} (${origin})`);
  assert.deepEqual(
    refused,
    [],
    `sign-in cannot return to: ${refused.join(", ")}. Add each exact origin to AUTH_ALLOWED_RETURN_HOSTS in the web-auth service.`
  );
});

test("every origin named in AUTH_ALLOWED_RETURN_HOSTS is a registered app, exactly", () => {
  const registry = new Set(appUrls(service("api")).map(([, origin]) => origin));
  for (const entry of explicitEntries()) {
    assert.match(
      entry,
      NAMED_ORIGIN,
      `${entry} must be one https host under the base domain, with no port or path`
    );
    assert.ok(
      registry.has(entry),
      `${entry} is not an app in the api registry; sign-in would return to a host no app serves`
    );
  }
});

test("the auth app's unit-test configuration lists the same origins as compose", () => {
  const fixture = read(UNIT_TEST).match(FIXTURE_HOSTS);
  assert.ok(fixture, `${UNIT_TEST} no longer has a STAGING.hosts fixture`);
  const fromCompose = explicitEntries().map((entry) =>
    entry.replace(BASE_DOMAIN_REF, STAGING_DOMAIN)
  );
  assert.deepEqual(
    fixture[1].split(",").sort(),
    fromCompose.sort(),
    `update STAGING.hosts in ${UNIT_TEST} to match AUTH_ALLOWED_RETURN_HOSTS`
  );
});
