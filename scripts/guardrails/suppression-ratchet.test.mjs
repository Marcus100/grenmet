// Every suppression hides something a tool wanted us to look at. Counts per
// kind may only go down, so new code cannot quietly add to the pile.

import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const SOURCE = /\.(?:py|[cm]?[jt]sx?)$/u;
const EXCLUDED =
  /^(?:surface|wis2box)\/|\/gen\/|^scripts\/guardrails\/suppression-ratchet\.test\.mjs$/u;
const KINDS = {
  "biome-ignore": /biome-ignore(?!-all)\b/u,
  "biome-ignore-all": /biome-ignore-all\b/u,
  noqa: /#\s*noqa\b/u,
  "ts-expect-error": /@ts-expect-error\b/u,
  "ts-ignore": /@ts-ignore\b/u,
  "type-ignore": /#\s*type:\s*ignore\b/u,
};

export function countSuppressions() {
  const files = execSync("git ls-files", { cwd: root, encoding: "utf8" })
    .split("\n")
    .filter((file) => SOURCE.test(file) && !EXCLUDED.test(file));
  const counts = Object.fromEntries(
    Object.keys(KINDS).map((kind) => [kind, 0])
  );
  for (const file of files)
    for (const line of readFileSync(join(root, file), "utf8").split("\n"))
      for (const [kind, pattern] of Object.entries(KINDS))
        if (pattern.test(line)) counts[kind] += 1;
  return counts;
}

test("suppression counts never exceed the committed baseline", () => {
  const { counts: baseline } = JSON.parse(
    readFileSync(
      join(root, "scripts/guardrails/suppression-baseline.json"),
      "utf8"
    )
  );
  const actual = countSuppressions();
  const over = Object.keys(KINDS).filter(
    (kind) => actual[kind] > baseline[kind]
  );
  assert.deepEqual(
    over.map((kind) => `${kind}: ${actual[kind]} > ${baseline[kind]}`),
    [],
    "Fix the underlying issue instead of suppressing it. If a suppression is truly needed, give a reason beside it and raise the baseline with a human reviewer."
  );
  const lowered = Object.keys(KINDS).filter(
    (kind) => actual[kind] < baseline[kind]
  );
  if (lowered.length > 0)
    console.log(
      `Suppressions went down; lower the baseline: ${lowered.map((kind) => `${kind} ${baseline[kind]} -> ${actual[kind]}`).join(", ")}`
    );
});

test("the baseline lists exactly the tracked suppression kinds", () => {
  const { counts } = JSON.parse(
    readFileSync(
      join(root, "scripts/guardrails/suppression-baseline.json"),
      "utf8"
    )
  );
  assert.deepEqual(Object.keys(counts).sort(), Object.keys(KINDS).sort());
});
