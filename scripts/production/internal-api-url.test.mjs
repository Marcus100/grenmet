import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const compose = readFileSync(
  new URL("../../infra/docker/docker-compose.deploy.yml", import.meta.url),
  "utf8"
);

const INTERNAL_API_URL = "http://api:8000";
const TOP_LEVEL_KEY = /^\S/u;
const SERVICE_HEADER = /^ {2}([a-z0-9-]+):\s*$/u;
const ENVIRONMENT_ALIAS = /^ {4}environment: \*([\w-]+)\s*$/mu;
const API_URL_SETTING = /^ {6}([A-Z0-9_]*API_URL): (.+)$/gmu;
const PUBLIC_API_HOST = /https:\/\/api\./u;

function serviceBlocks(text) {
  const lines = text.split("\n");
  const start = lines.indexOf("services:");
  const blocks = new Map();
  let name = null;
  for (const line of lines.slice(start + 1)) {
    if (TOP_LEVEL_KEY.test(line)) break;
    const header = line.match(SERVICE_HEADER);
    if (header) {
      name = header[1];
      blocks.set(name, []);
    } else if (name) {
      blocks.get(name).push(line);
    }
  }
  return new Map([...blocks].map(([key, body]) => [key, body.join("\n")]));
}

function environmentOf(block, blocks) {
  const alias = block.match(ENVIRONMENT_ALIAS);
  if (!alias) return block;
  const anchor = new RegExp(`^ {4}environment: &${alias[1]}\\s*$`, "mu");
  const owner = [...blocks.values()].find((body) => anchor.test(body));
  assert.ok(owner, `environment anchor &${alias[1]} not found`);
  return owner;
}

function setting(environment, key) {
  const match = environment.match(new RegExp(`^ {6}${key}: (.+)$`, "mu"));
  return match ? match[1].trim() : undefined;
}

const blocks = serviceBlocks(compose);
const webServices = [...blocks.keys()].filter(
  (name) => name.startsWith("web-") || name === "cms-migrate"
);

test("deploy compose web services call FastAPI on the internal network", () => {
  const configured = [];
  for (const name of webServices) {
    const environment = environmentOf(blocks.get(name), blocks);
    const value = setting(environment, "AUTH_API_URL");
    if (value === undefined) continue;
    configured.push(name);
    assert.equal(value, INTERNAL_API_URL, `${name} AUTH_API_URL`);
  }
  for (const name of ["web-auth", "web-docs", "web-gms", "web-cms"]) {
    assert.ok(configured.includes(name), `${name} sets AUTH_API_URL`);
  }
});

test("deploy compose server-side API URLs never use the public API hostname", () => {
  for (const name of webServices) {
    const environment = environmentOf(blocks.get(name), blocks);
    for (const match of environment.matchAll(API_URL_SETTING)) {
      if (match[1].startsWith("NEXT_PUBLIC_")) continue;
      assert.doesNotMatch(
        match[2],
        PUBLIC_API_HOST,
        `${name} ${match[1]} hairpins through the public proxy`
      );
    }
  }
});
