import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const compose = read("../../infra/docker/docker-compose.deploy.yml");
const dockerfile = read("../../apps/api/fastapi/Dockerfile.prod");

const CIDR = /^\d{1,3}(?:\.\d{1,3}){3}\/\d{1,2}$/;
const FLAG = /"--forwarded-allow-ips",\s*"([^"]+)"/;
const NETWORK = /^ {2}grenmet:\n((?: {4}.*\n|\s*\n)+)/m;
const API_SERVICE = /^ {2}api:\n([\s\S]*?)^ {2}\S/m;
const GRENMET_NETWORK = /networks:\n\s+- grenmet/;
const SUBNET = /^ {8}- subnet: (\S+)\s*$/m;

function flagValue() {
  const match = dockerfile.match(FLAG);
  assert.ok(match, "Dockerfile.prod CMD sets --forwarded-allow-ips");
  return match[1];
}

function composeSubnet() {
  const networks = compose.slice(compose.indexOf("\nnetworks:"));
  const block = networks.match(NETWORK);
  assert.ok(block, "compose defines the grenmet network");
  const subnet = block[1].match(SUBNET);
  assert.ok(subnet, "grenmet network pins an explicit ipam subnet");
  return subnet[1];
}

test("uvicorn never trusts forwarded headers from every address", () => {
  const value = flagValue();
  assert.notEqual(value, "*");
  assert.match(value, CIDR);
});

test("uvicorn trusted proxy range equals the pinned compose subnet", () => {
  assert.equal(flagValue(), composeSubnet());
});

test("the api service stays on the pinned grenmet network", () => {
  const api = compose.match(API_SERVICE);
  assert.ok(api, "api service found");
  assert.match(api[1], GRENMET_NETWORK);
});
