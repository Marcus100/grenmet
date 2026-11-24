// Structural checks on the pull-request check selection (docs/operations/
// release-runbook.md, "Pull-request check selection"): a job that selection can
// skip must be covered by its workflow's gate, and the gate must treat a skip
// as a pass only when selection said the job was not needed.
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import test from "node:test";

import { selectChecks } from "../ci/select-checks.mjs";

const JOBS_HEADER = /^jobs:\n/mu;
const JOB_SPLIT = /\n(?= {2}[a-z][a-z0-9-]*:\n)/u;
const JOB_ID = /^\s{2}([a-z][a-z0-9-]*):\n/mu;
const JOB_NEEDS = /^ {4}needs: \[([^\]]*)\]/mu;
const JOB_IF = /^ {4}if: (.*)$/mu;
const ALWAYS = /always\(\)/u;
const PYTHON_OUTPUT = /outputs\.python == 'true'/u;
const FUZZ_MARK = /-m fuzz/u;
const NOT_VERIFIED = /verified != 'true'/u;
const GATE_RESULT =
  /job\.result !== 'success' && !\(\(omitted \|\| promoted\) && job\.result === 'skipped'\)/u;
const UNSELECTED = /const unselected = \['\[\]', 'false'\]/u;
const SELECTION_OK = /selection\.result === 'success' && unselected\.includes/u;
const SELECTION_OUTPUTS = /outputs\.(webtests|storage|python|coverage)/u;
const JOBS_KEY = /^jobs:/mu;
const PATHS_FILTER = /^\s+paths(-ignore)?:/mu;
const API_OR_APPS = /\/(api|apps)\//u;

const read = (path) =>
  readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const workflow = (name) => read(`.github/workflows/${name}`);

/** Top-level jobs of a workflow: id -> { block, needs, condition }. */
function jobs(source) {
  const body = source.split(JOBS_HEADER)[1];
  const result = {};
  for (const block of body.split(JOB_SPLIT)) {
    const id = JOB_ID.exec(block)?.[1];
    if (!id) continue;
    const needs = JOB_NEEDS.exec(block)?.[1] ?? "";
    result[id] = {
      block,
      needs: needs
        .split(",")
        .map((name) => name.trim())
        .filter(Boolean),
      condition: JOB_IF.exec(block)?.[1] ?? "",
    };
  }
  return result;
}

const covered = (all, gateNeeds) => {
  const seen = new Set(gateNeeds);
  const queue = [...gateNeeds];
  while (queue.length)
    for (const need of all[queue.pop()]?.needs ?? [])
      if (!seen.has(need)) {
        seen.add(need);
        queue.push(need);
      }
  return seen;
};

const selectionOutput = /needs\.image-selection\.outputs\.[a-z]+/u;

test("ci-api: every job selection can skip is behind the CI Success gate", () => {
  const all = jobs(workflow("ci-api.yml"));
  const gate = all["ci-success"];
  assert.ok(gate, "ci-success job");
  assert.match(gate.condition, ALWAYS);
  const reachable = covered(all, gate.needs);
  for (const [id, job] of Object.entries(all)) {
    if (id === "ci-success" || !selectionOutput.test(job.condition)) continue;
    assert.ok(
      reachable.has(id),
      `${id} can be skipped but CI Success does not cover it`
    );
  }
  // Every direct skippable job is judged on its own selection output.
  const script = gate.block;
  for (const id of [
    "quality",
    "security",
    "collectors",
    "docker",
    "surface",
    "docs",
  ]) {
    const output = selectionOutput.exec(all[id].condition)[0].split(".").pop();
    assert.ok(
      script.includes(
        `needs.${id}.result }}" = "skipped" ] && [ "\${{ needs.image-selection.outputs.${output} }}" = "false"`
      ),
      `${id}: a skip passes only when selection said ${output}=false`
    );
    assert.ok(
      script.includes(`needs.${id}.result }}" != "success"`),
      `${id}: anything but success or an intended skip fails`
    );
  }
  // The selection job itself must succeed, or every job is judged unselected.
  assert.ok(script.includes('needs.image-selection.result }}" != "success"'));
});

test("ci-api: Run Tests covers the shards, the fuzz suite and the coverage floor", () => {
  const all = jobs(workflow("ci-api.yml"));
  assert.deepEqual(all.test.needs.sort(), [
    "coverage",
    "image-selection",
    "test-shard",
  ]);
  assert.match(all.test.condition, ALWAYS);
  assert.match(all["test-shard"].condition, PYTHON_OUTPUT);
  assert.match(all["test-shard"].block, FUZZ_MARK);
  assert.ok(
    all.test.block.includes('needs.test-shard.result }}" != "success"')
  );
  assert.ok(all.test.block.includes('needs.coverage.result }}" != "success"'));
});

test("ci-web: every job selection can skip is behind Build Web Apps", () => {
  const all = jobs(workflow("ci-web.yml"));
  const gate = all.build;
  assert.ok(gate, "build job");
  assert.match(gate.condition, ALWAYS);
  const reachable = covered(all, gate.needs);
  const skippable = (job) =>
    selectionOutput.test(job.condition) || NOT_VERIFIED.test(job.condition);
  for (const [id, job] of Object.entries(all)) {
    if (id === "build" || id === "image-selection" || !skippable(job)) continue;
    assert.ok(
      gate.needs.includes(id),
      `${id} can be skipped but Build Web Apps does not list it`
    );
    assert.ok(reachable.has(id));
  }
  // A skip passes only for an unselected job (or a verified promotion); the
  // gate fails for every other result, including cancelled and failure.
  assert.match(gate.block, GATE_RESULT);
  assert.match(gate.block, UNSELECTED);
  assert.match(gate.block, SELECTION_OK);
  // Every job gated on a selection output has a key in the gate's map.
  for (const [id, job] of Object.entries(all)) {
    const output = selectionOutput.exec(job.condition)?.[0].split(".").pop();
    if (!output || output === "verified" || id === "build") continue;
    const key = {
      tests: "webtests",
      "gaa-admin-tests": "webtests",
      "web-coverage": "coverage",
      "container-smoke": "web",
      "storage-integration": "storage",
      "weather-images": "weather",
    }[id];
    assert.equal(key, output, `${id} maps to ${output}`);
    assert.ok(
      gate.block.includes(
        `'${id}': '${output === "webtests" ? "webtests" : key}'`
      ) || gate.block.includes(`${id}: '${key}'`),
      `${id} is mapped in the gate`
    );
  }
});

test("the required-check jobs are never narrowed by selection", () => {
  // Skipped required checks pass on a pull request but would not satisfy
  // promotion-verified (it needs a success conclusion on the dev commit).
  const web = jobs(workflow("ci-web.yml"));
  for (const id of ["biome", "type-check", "peer-check", "guardrails", "drift"])
    assert.doesNotMatch(web[id].condition, SELECTION_OUTPUTS, id);
  const client = workflow("ci-api-client.yml");
  assert.ok(!client.includes("select-checks"));
});

test("workflows that select through a changes job fail open", () => {
  const expectations = {
    "e2e.yml": ["journeys", "journeys"],
    "codeql.yml": ["analyze", "codeql"],
    "api-breaking-changes.yml": ["breaking", "apiContract"],
  };
  for (const [name, [target, output]] of Object.entries(expectations)) {
    const all = jobs(workflow(name));
    assert.ok(all.changes, `${name}: changes job`);
    assert.ok(
      all.changes.block.includes("node scripts/ci/select-checks.mjs"),
      name
    );
    assert.ok(all.changes.block.includes("fetch-depth: 0"), name);
    assert.ok(all[target].needs.includes("changes"), name);
    assert.ok(all[target].condition.includes("!cancelled()"), name);
    assert.ok(
      all[target].condition.includes("needs.changes.result != 'success'"),
      `${name}: runs when selection itself failed`
    );
    assert.ok(
      all[target].condition.includes(`needs.changes.outputs.${output}`),
      name
    );
    // No path filter that could leave a required check pending.
    const trigger = workflow(name).split(JOBS_KEY)[0];
    if (name !== "codeql.yml") assert.doesNotMatch(trigger, PATHS_FILTER, name);
  }
});

test("no required check lives in a workflow with a workflow-level paths filter", () => {
  const required = new Set(
    JSON.parse(read("infra/github/rulesets.json")).flatMap((ruleset) =>
      ruleset.rules
        .filter((rule) => rule.type === "required_status_checks")
        .flatMap((rule) =>
          rule.parameters.required_status_checks.map((check) => check.context)
        )
    )
  );
  for (const file of readdirSync(
    new URL("../../.github/workflows/", import.meta.url)
  )) {
    const source = workflow(file);
    const trigger = source.split(JOBS_KEY)[0];
    if (!PATHS_FILTER.test(trigger)) continue;
    for (const name of required)
      assert.ok(
        !new RegExp(`name: ${name}$`, "mu").test(source),
        `${file} filters paths but provides ${name}`
      );
  }
});

test("the path map still selects the API suite for every repository path its tests read", () => {
  // Paths the API tests resolve from the repository root (tests/**/*.py).
  const reads = [
    "packages/gms/src/sectors.ts",
    "packages/gms/src/styles/foundation.css",
    "apps/web/bookings/src/app/page.tsx",
    "apps/web/hr/src/app/page.tsx",
    "apps/web/gms/src/lib/metpy-heat-index.fixture.json",
    "apps/web/gaa-admin/src/components/wxproducts/metpy-humidity.fixture.json",
    "apps/web/gaa-admin/drizzle/wxwatch/0000_slippery_magma.sql",
    "docs/ports.md",
    "scripts/gms-roster/profiles/gms.json",
    "scripts/wis2-setup/Surface-RA-IV-100.json",
    "infra/docker/docker-compose.deploy.yml",
  ];
  for (const path of reads)
    assert.equal(
      selectChecks([path], { baseRef: "dev", rollout: "on" }).api,
      true,
      path
    );
  // A new repository path read from an API test must be added to the map:
  // list every apps/, packages/, docs/ or scripts/ path the tests mention.
  const tests = [];
  const walk = (dir) => {
    for (const entry of readdirSync(new URL(`../../${dir}`, import.meta.url), {
      withFileTypes: true,
    })) {
      const path = `${dir}${entry.name}`;
      if (entry.isDirectory()) walk(`${path}/`);
      else if (path.endsWith(".py")) tests.push(path);
    }
  };
  walk("apps/api/fastapi/tests/");
  const mentioned = new Set();
  for (const path of tests)
    for (const match of read(path).matchAll(
      /["'/](packages|docs|scripts|infra)\/([\w.-]+)/gu
    ))
      if (!API_OR_APPS.test(match[0])) mentioned.add(`${match[1]}/${match[2]}`);
  for (const top of mentioned) {
    const selection = selectChecks(
      [top.includes(".") ? top : `${top}/probe.txt`],
      { baseRef: "dev", rollout: "on" }
    );
    assert.ok(
      selection.api || selection.full,
      `API tests mention ${top}, but a change there would skip the API suite`
    );
  }
});
