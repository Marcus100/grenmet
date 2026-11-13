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

// The real release list on 2026-11-08: x.y.z tags after the old vN.M ones.
const REAL_TAGS = ["v1.0.3", "v1.0.2", "v1.0.1", "v1.0.0", "v0.31", "v0.30"];

test("x.y.z tags win over the older vN.M tags and bump the patch", () => {
  assert.equal(latestReleaseTag(REAL_TAGS), "v1.0.3");
  assert.equal(nextReleaseTag(REAL_TAGS), "v1.0.4");
});

test("compares numerically, not alphabetically", () => {
  assert.equal(latestReleaseTag(["v1.0.9", "v1.0.10", "v1.0.2"]), "v1.0.10");
  assert.equal(nextReleaseTag(["v1.0.9", "v1.0.10"]), "v1.0.11");
  assert.equal(latestReleaseTag(["v0.9", "v0.10", "v0.2"]), "v0.10");
});

test("a higher minor or major wins over a higher patch", () => {
  assert.equal(latestReleaseTag(["v1.0.12", "v1.1.0"]), "v1.1.0");
  assert.equal(latestReleaseTag(["v0.99", "v1.0.0"]), "v1.0.0");
  assert.equal(latestReleaseTag(["v1.0", "v1.0.1"]), "v1.0.1");
});

test("a legacy vN.M latest tag counts as vN.M.0", () => {
  assert.equal(nextReleaseTag(["v0.31", "v0.30"]), "v0.31.1");
});

test("ignores tags that are not release tags", () => {
  const tags = ["v.03", "v1.0.4-rc1", "latest", "v1.0.2", " v1.0.1 ", "v1"];
  assert.equal(latestReleaseTag(tags), "v1.0.2");
  assert.equal(nextReleaseTag(tags), "v1.0.3");
});

test("fails clearly when there is nothing to increment", () => {
  assert.equal(latestReleaseTag([]), null);
  assert.throws(() => nextReleaseTag(["v.03", "nightly"]), NO_TAG_ERROR);
});

test("validates hand-typed tags as vX.Y.Z", () => {
  assert.equal(isReleaseTag("v1.0.4"), true);
  assert.equal(isReleaseTag("v2.10.0"), true);
  for (const bad of [
    "1.0.4",
    "v1.0",
    "v0.32",
    "v1.0.x",
    "v.03",
    "",
    "v1.0.4 ",
  ]) {
    assert.equal(isReleaseTag(bad), false, bad);
  }
});

test("CLI prints the next tag, the latest tag, and validates input", () => {
  const tags = `${REAL_TAGS.join("\n")}\nv.03\n`;
  assert.equal(run(tags).stdout.trim(), "v1.0.4");
  assert.equal(run(tags, "--latest").stdout.trim(), "v1.0.3");
  assert.equal(run("", "--validate", "v1.0.4").status, 0);
  assert.equal(run("", "--validate", "v0.32").status, 1);
  const empty = run("");
  assert.equal(empty.status, 1);
  assert.match(empty.stderr, NO_TAG_ERROR);
});
