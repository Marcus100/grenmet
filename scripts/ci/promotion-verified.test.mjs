import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { requiredChecks } from "./promote-images.mjs";
import { promotionVerified } from "./promotion-verified.mjs";

const NO_MATCHING_TREE = /No dev commit has tree/u;

const TREE = "1".repeat(40);
const DEV = "d".repeat(40);
const RULESETS_TEXT = readFileSync(
  new URL("../../infra/github/rulesets.json", import.meta.url),
  "utf8"
);
const CHECKS = requiredChecks(JSON.parse(RULESETS_TEXT));

function git({ tree = TREE, devLog = `${DEV} ${TREE}\n` } = {}) {
  return (args) => {
    if (args[0] === "rev-parse") return `${tree}\n`;
    if (args[0] === "log") return devLog;
    if (args[0] === "show" && args[1] === `${DEV}:infra/github/rulesets.json`)
      return RULESETS_TEXT;
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
}

/** check-runs for DEV as `gh api --jq` prints them (name, conclusion, app id). */
function gh(runs = CHECKS.map(({ name, appId }) => [name, "success", appId])) {
  return (args) => {
    assert.ok(args.at(2).includes(`/commits/${DEV}/check-runs`));
    return runs.map((run) => run.join("\t")).join("\n");
  };
}

const ask = (overrides) =>
  promotionVerified({
    git: git(),
    gh: gh(),
    repository: "Marcus100/grenmet",
    ...overrides,
  });

test("a promotion whose tree passed every required check on dev is verified", () => {
  const result = ask();
  assert.equal(result.verified, true);
  assert.equal(result.commit, DEV);
});

test("code that never landed on dev runs every check", () => {
  const result = ask({ git: git({ tree: "4".repeat(40) }) });
  assert.equal(result.verified, false);
  assert.match(result.reason, NO_MATCHING_TREE);
});

test("a failed, cancelled or missing required check on dev runs every check", () => {
  const [first, ...rest] = CHECKS;
  const passing = rest.map(({ name, appId }) => [name, "success", appId]);
  for (const runs of [
    [[first.name, "failure", first.appId], ...passing],
    [[first.name, "cancelled", first.appId], ...passing],
    passing,
  ]) {
    const result = ask({ gh: gh(runs) });
    assert.equal(result.verified, false, JSON.stringify(runs[0]));
    assert.match(result.reason, new RegExp(first.name, "u"));
  }
});

test("a check of the right name from another app does not count", () => {
  const runs = CHECKS.map(({ name, appId }, index) => [
    name,
    "success",
    index === 0 ? 999_999 : appId,
  ]);
  assert.equal(ask({ gh: gh(runs) }).verified, false);
});

test("an API or git failure runs every check instead of failing open", () => {
  const broken = () => {
    throw new Error("HTTP 502");
  };
  assert.equal(ask({ gh: broken }).verified, false);
  assert.equal(ask({ git: broken }).verified, false);
});
