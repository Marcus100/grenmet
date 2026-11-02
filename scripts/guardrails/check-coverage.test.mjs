import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  evaluate,
  parseCobertura,
  parseSummary,
  raiseFloors,
} from "./check-coverage.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const NO_TOTAL = /no total/u;
const NO_RATES = /no line-rate/u;
const FLOORS = {
  api: { branches: 60, lines: 80 },
  "web/gms": { branches: 50, lines: 70 },
};

test("parses a vitest json-summary total", () => {
  const summary = {
    total: {
      branches: { pct: 41.2 },
      lines: { pct: 77.5 },
      statements: { pct: 1 },
    },
  };
  assert.deepEqual(parseSummary(summary), { branches: 41.2, lines: 77.5 });
  assert.throws(() => parseSummary({ total: {} }), NO_TOTAL);
});

test("parses the root of a Cobertura coverage.xml", () => {
  const xml =
    '<?xml version="1.0" ?><coverage version="7.4" line-rate="0.8421" branch-rate="0.6"><packages/></coverage>';
  assert.deepEqual(parseCobertura(xml), { branches: 60, lines: 84.2 });
  assert.throws(() => parseCobertura("<coverage></coverage>"), NO_RATES);
});

test("passes at or above the floor and fails below it", () => {
  const ok = evaluate(FLOORS, {
    api: { branches: 60, lines: 80 },
    "web/gms": { branches: 55, lines: 71 },
  });
  assert.deepEqual(ok.failures, []);
  assert.equal(ok.passes.length, 4);

  const bad = evaluate(FLOORS, { api: { branches: 59.9, lines: 90 } });
  assert.deepEqual(bad.failures, ["api branches 59.9% (floor 60%)"]);
});

test("a target with no report is skipped, not failed", () => {
  const result = evaluate(FLOORS, { api: { branches: 70, lines: 90 } });
  assert.deepEqual(result.skipped, ["web/gms"]);
  assert.deepEqual(result.failures, []);
});

test("floors rise with coverage, never fall, and untracked targets are ignored", () => {
  const next = raiseFloors(FLOORS, {
    api: { branches: 70, lines: 79 },
    "web/gms": { branches: 50.2, lines: 90 },
    "web/new": { branches: 99, lines: 99 },
  });
  // 70 - 0.5 raises branches; 79 - 0.5 is below the 80 floor, so lines stay.
  assert.deepEqual(next.api, { branches: 69.5, lines: 80 });
  assert.deepEqual(next["web/gms"], { branches: 50, lines: 89.5 });
  assert.equal(next["web/new"], undefined);
  assert.deepEqual(FLOORS.api, { branches: 60, lines: 80 });
});

test("the committed baseline is well formed", () => {
  const { floors } = JSON.parse(
    readFileSync(
      join(root, "scripts/guardrails/coverage-baseline.json"),
      "utf8"
    )
  );
  assert.ok(floors.api, "api floor is tracked");
  assert.ok(Object.keys(floors).some((k) => k.startsWith("web/")));
  for (const [target, wanted] of Object.entries(floors))
    for (const metric of ["lines", "branches"]) {
      assert.ok(
        wanted[metric] >= 0 && wanted[metric] <= 100,
        `${target} ${metric} is a percentage`
      );
    }
});
