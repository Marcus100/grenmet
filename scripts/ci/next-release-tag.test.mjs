import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  isReleaseTag,
  latestReleaseTag,
  nextReleaseTag,
} from "./next-release-tag.mjs";

const script = fileURLToPath(
  new URL("./next-release-tag.mjs", import.meta.url)
);
const NO_TAG_ERROR = /No existing/u;
const run = (input, ...args) =>
  spawnSync("node", [script, ...args], { encoding: "utf8", input });

test("compares tags numerically, not alphabetically", () => {
  assert.equal(latestReleaseTag(["v0.9", "v0.10", "v0.2"]), "v0.10");
  assert.equal(nextReleaseTag(["v0.9", "v0.10", "v0.2"]), "v0.11");
});

test("a higher major version wins over a higher minor", () => {
  assert.equal(latestReleaseTag(["v0.99", "v1.0"]), "v1.0");
  assert.equal(nextReleaseTag(["v0.99", "v1.0"]), "v1.1");
});

test("ignores tags that are not vN.M (such as the stray v.03)", () => {
  const tags = ["v.03", "v0.23", "v0.24-rc1", "latest", "v0.22", " v0.7 "];
  assert.equal(latestReleaseTag(tags), "v0.23");
  assert.equal(nextReleaseTag(tags), "v0.24");
});

test("fails clearly when there is nothing to increment", () => {
  assert.equal(latestReleaseTag([]), null);
  assert.throws(() => nextReleaseTag(["v.03", "nightly"]), NO_TAG_ERROR);
});

test("validates hand-typed tags", () => {
  assert.equal(isReleaseTag("v0.24"), true);
  assert.equal(isReleaseTag("v1.0"), true);
  for (const bad of ["0.24", "v0.24.1", "v0.x", "v.03", "", "v0.24 "]) {
    assert.equal(isReleaseTag(bad), false, bad);
  }
});

test("CLI prints the next tag, the latest tag, and validates input", () => {
  const tags = "v0.22\nv0.23\nv.03\n";
  assert.equal(run(tags).stdout.trim(), "v0.24");
  assert.equal(run(tags, "--latest").stdout.trim(), "v0.23");
  assert.equal(run("", "--validate", "v0.24").status, 0);
  assert.equal(run("", "--validate", "banana").status, 1);
  const empty = run("");
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, NO_TAG_ERROR);
});
