// The drift check must ignore what GitHub changes on its own (ids, timestamps,
// ordering) and catch what a person changes (a rule, a required check, a
// bypass actor). No network: the live shape is a fixture.

import assert from "node:assert/strict";
import test from "node:test";
import {
  diff,
  normalize,
  readSnapshot,
  withoutHiddenBypassActors,
} from "./github-rulesets.mjs";

const MISSING_SECOND_CHECK = /^missing .*\[1\]\.context = "Type Check"/u;
const MENTIONS_CHECKS = /required_status_checks/u;
const ADDED_BYPASS_ACTOR = /^added .*bypass_actors\[0\]/u;

const live = (overrides = {}) => ({
  id: 15_329_335,
  node_id: "RRS_x",
  name: "Protect staging",
  target: "branch",
  source_type: "Repository",
  source: "Marcus100/grenmet",
  enforcement: "active",
  _links: { self: { href: "https://api.github.com/x" } },
  created_at: "2026-04-21T04:41:11.251Z",
  updated_at: "2026-10-11T15:02:31.903Z",
  conditions: { ref_name: { exclude: [], include: ["refs/heads/staging"] } },
  bypass_actors: [],
  rules: [
    {
      type: "required_status_checks",
      parameters: {
        strict_required_status_checks_policy: false,
        required_status_checks: [
          { context: "Type Check", integration_id: 15_368 },
          { context: "CI Success", integration_id: 15_368 },
        ],
      },
    },
    {
      type: "pull_request",
      parameters: { required_approving_review_count: 0 },
    },
    { type: "non_fast_forward" },
  ],
  ...overrides,
});

test("normalize drops volatile fields and sorts rulesets, rules and checks", () => {
  const [ruleset] = normalize([live()]);
  for (const key of ["id", "node_id", "_links", "created_at", "updated_at"]) {
    assert.equal(key in ruleset, false, key);
  }
  assert.deepEqual(
    ruleset.rules.map((rule) => rule.type),
    ["non_fast_forward", "pull_request", "required_status_checks"]
  );
  assert.deepEqual(
    ruleset.rules[2].parameters.required_status_checks.map((c) => c.context),
    ["CI Success", "Type Check"]
  );
  const names = normalize([live({ name: "b" }), live({ name: "a" })]).map(
    (r) => r.name
  );
  assert.deepEqual(names, ["a", "b"]);
});

test("same rules in a different order or with new timestamps is not drift", () => {
  const expected = normalize([live()]);
  const reordered = live({
    updated_at: "2026-12-01T00:00:00Z",
    id: 1,
    rules: [...live().rules].reverse(),
  });
  assert.deepEqual(diff(expected, normalize([reordered])), []);
});

test("a removed check, a changed rule or a new bypass actor is drift", () => {
  const expected = normalize([live()]);
  const rules = live().rules;
  rules[0].parameters.required_status_checks.pop();
  const fewerChecks = diff(expected, normalize([live({ rules })]));
  assert.ok(fewerChecks.length > 0);
  assert.ok(
    fewerChecks.every((line) => MENTIONS_CHECKS.test(line)),
    fewerChecks.join("\n")
  );
  assert.ok(
    fewerChecks.some((line) => MISSING_SECOND_CHECK.test(line)),
    fewerChecks.join("\n")
  );

  const bypass = live({
    bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole" }],
  });
  const added = diff(expected, normalize([bypass]));
  assert.ok(added.some((line) => ADDED_BYPASS_ACTOR.test(line)));

  const disabled = live({ enforcement: "disabled" });
  const changed = diff(expected, normalize([disabled]));
  assert.deepEqual(changed, [
    'changed  [0].enforcement: "active" -> "disabled"',
  ]);

  const gone = diff(expected, normalize([]));
  assert.ok(gone.length > 0);
  assert.ok(gone.every((line) => line.startsWith("missing")));
});

test("bypass actors hidden from a non-admin token are not compared, visible ones are", () => {
  const expected = normalize([live()]);
  const { bypass_actors: _hidden, ...withoutField } = live();
  const hidden = normalize([withoutField]);
  const { comparable, unchecked } = withoutHiddenBypassActors(expected, hidden);
  assert.deepEqual(unchecked, ["Protect staging"]);
  assert.deepEqual(diff(comparable, hidden), []);

  const visible = normalize([
    live({ bypass_actors: [{ actor_id: 5, actor_type: "RepositoryRole" }] }),
  ]);
  const checked = withoutHiddenBypassActors(expected, visible);
  assert.deepEqual(checked.unchecked, []);
  assert.ok(
    diff(checked.comparable, visible).some((line) =>
      ADDED_BYPASS_ACTOR.test(line)
    )
  );
});

test("the committed snapshot protects staging and main with a PR and CI Success", () => {
  const snapshot = readSnapshot();
  const names = snapshot.map((ruleset) => ruleset.name);
  assert.ok(names.includes("Protect main"), names.join(", "));
  assert.ok(names.includes("Protect staging"), names.join(", "));
  for (const ruleset of snapshot) {
    assert.equal(ruleset.enforcement, "active", ruleset.name);
    assert.deepEqual(ruleset.bypass_actors, [], `${ruleset.name} bypass`);
    const types = ruleset.rules.map((rule) => rule.type);
    assert.ok(types.includes("pull_request"), `${ruleset.name} pull_request`);
    assert.ok(types.includes("non_fast_forward"), `${ruleset.name} non-ff`);
    const checks = ruleset.rules.find(
      (rule) => rule.type === "required_status_checks"
    );
    assert.ok(
      checks?.parameters.required_status_checks.some(
        (check) => check.context === "CI Success"
      ),
      `${ruleset.name} requires CI Success`
    );
  }
});
