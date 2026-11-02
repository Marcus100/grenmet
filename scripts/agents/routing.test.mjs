import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  chooseRoute,
  formatReport,
  HUMAN_ONLY,
  PREFERENCES,
  paretoFrontier,
  routeFor,
  summarizeBenchmarks,
  taskArea,
} from "./routing.mjs";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const CLAUDE_HAIKU = "claude-haiku-5-5";
const LUNA = "gpt-6-luna";
const WEB_EVIDENCE = /^3 runs, pass 97%, tokens 400;/u;
const DIFFERS = /differs from the owner preference/u;
const AGREES_AT_END = /agrees with the owner preference$/u;
const STARRED = /^\*/u;

const WEB_TASK = { id: "bm-w", hidden_tests: ["apps/web/gms/src/a.test.ts"] };
const MIXED_TASK = {
  id: "bm-m",
  hidden_tests: ["apps/web/gms/src/a.test.ts", "scripts/x.test.mjs"],
};
const OPEN_TASK = { id: "bm-o", hidden_tests: [] };

const row = (fields) => ({
  agent: "claude",
  area: "web",
  firstPassRate: 1,
  meanCostUsd: null,
  meanMinutes: 1,
  meanOutputTokens: 0,
  meanTotalTokens: 0,
  model: CLAUDE_HAIKU,
  passRate: 1,
  runs: 3,
  ...fields,
});

test("a task's area comes from its tests when they share one area", () => {
  assert.equal(taskArea(WEB_TASK), "web");
  assert.equal(
    taskArea({ hidden_tests: ["apps/api/fastapi/tests/t.py"] }),
    "api"
  );
  assert.equal(taskArea({ hidden_tests: ["docs/a.md"] }), "docs");
  assert.equal(taskArea(MIXED_TASK), "all");
  assert.equal(taskArea(OPEN_TASK), "all");
  assert.equal(taskArea({ area: "api", hidden_tests: [] }), "api");
});

test("summaries group runs by agent, model and area with the documented rates", () => {
  const tasks = [WEB_TASK, OPEN_TASK];
  const results = {
    records: [
      {
        agent: "claude",
        model: CLAUDE_HAIKU,
        retries: 0,
        task: "bm-w",
        verify: "pass",
        wall_minutes: 10,
      },
      {
        agent: "claude",
        model: CLAUDE_HAIKU,
        retries: 1,
        task: "bm-w",
        verify: "fail",
        wall_minutes: 20,
      },
      {
        agent: "codex",
        model: LUNA,
        retries: 0,
        task: "bm-o",
        verify: "pass",
        wall_minutes: 5,
      },
      {
        agent: "claude",
        model: CLAUDE_HAIKU,
        retries: 0,
        task: "bm-o",
        verify: "pass",
        wall_minutes: 6,
      },
    ],
    runs: [
      {
        details: {
          outputTokens: 100,
          reportedCostUsd: 1,
          totalInputTokens: 900,
        },
      },
      {
        details: {
          outputTokens: 300,
          reportedCostUsd: 3,
          totalInputTokens: 1700,
        },
      },
      { details: { outputTokens: 50, totalInputTokens: 400 } },
      {
        details: {
          outputTokens: 200,
          reportedCostUsd: 2,
          totalInputTokens: 600,
        },
      },
    ],
  };
  const rows = summarizeBenchmarks(results, tasks);
  const web = rows.find((r) => r.area === "web");
  const codex = rows.find((r) => r.agent === "codex");
  const all = rows.find((r) => r.area === "all" && r.agent === "claude");

  assert.equal(rows.length, 3);
  assert.equal(web.runs, 2);
  assert.equal(web.passRate, 0.5);
  assert.equal(web.firstPassRate, 0.5);
  assert.equal(web.meanOutputTokens, 200);
  assert.equal(web.meanTotalTokens, 1500);
  assert.equal(web.meanCostUsd, 2);
  assert.equal(web.meanMinutes, 15);
  assert.equal(codex.meanCostUsd, null, "codex reports no cost");
  assert.equal(all.runs, 1);
  assert.equal(all.meanCostUsd, 2);
});

test("the Pareto frontier drops rows that are worse on both axes and keeps ties", () => {
  const a = row({ agent: "a", passRate: 0.9, meanTotalTokens: 100 });
  const dominated = row({ agent: "b", passRate: 0.9, meanTotalTokens: 200 });
  const cheaper = row({ agent: "c", passRate: 0.8, meanTotalTokens: 50 });
  const tie = row({ agent: "d", passRate: 0.9, meanTotalTokens: 100 });
  const frontier = paretoFrontier([a, dominated, cheaper, tie]);
  assert.deepEqual(frontier.map((r) => r.agent).sort(), ["a", "c", "d"]);
});

test("the chosen route is the cheapest frontier row within five points of the best", () => {
  const rows = [
    row({
      agent: "claude",
      model: CLAUDE_HAIKU,
      passRate: 1,
      meanTotalTokens: 1000,
    }),
    row({ agent: "codex", model: LUNA, passRate: 0.97, meanTotalTokens: 400 }),
    row({ agent: "codex", model: "other", passRate: 0.9, meanTotalTokens: 10 }),
  ];
  const routes = chooseRoute(rows, {
    preferences: { web: PREFERENCES.web },
  });
  assert.equal(routes.web.agent, "codex");
  assert.equal(routes.web.model, LUNA);
  assert.equal(routes.web.measured, true);
  assert.match(routes.web.evidence, WEB_EVIDENCE);
  assert.match(routes.web.evidence, DIFFERS);
});

test("an area with too few runs keeps its preference and says it is unmeasured", () => {
  const rows = [
    row({
      agent: "codex",
      model: LUNA,
      runs: 2,
      passRate: 1,
      meanTotalTokens: 1,
    }),
  ];
  const routes = chooseRoute(rows);
  assert.deepEqual(routes.web, {
    agent: PREFERENCES.web.agent,
    evidence:
      "not measured: 2 web runs, 3 needed for one row; owner preference kept",
    measured: false,
    model: PREFERENCES.web.model,
  });
  assert.equal(routes.api.measured, false);
  assert.equal(routes.api.model, PREFERENCES.api.model);
  assert.equal(routes.ci.measured, false);
  assert.equal(routes.ci.agent, "claude");
  assert.equal(routes.ci.model, PREFERENCES.ci.model);
});

test("a measured route that matches the preference says so", () => {
  const rows = [
    row({
      agent: "claude",
      model: CLAUDE_HAIKU,
      area: "docs",
      passRate: 0.9,
      meanTotalTokens: 2000,
    }),
  ];
  const routes = chooseRoute(rows, {
    preferences: { docs: PREFERENCES.docs },
  });
  assert.equal(routes.docs.measured, true);
  assert.match(routes.docs.evidence, AGREES_AT_END);
});

test("the report marks frontier rows with a star", () => {
  const rows = [
    row({ agent: "claude", passRate: 1, meanTotalTokens: 1000 }),
    row({ agent: "codex", model: LUNA, passRate: 0.8, meanTotalTokens: 2000 }),
  ];
  const lines = formatReport(rows).split("\n");
  assert.match(lines[1], STARRED);
  assert.doesNotMatch(lines[2], STARRED);
});

const ROUTING = {
  areas: {
    web: { agent: "claude", measured: false, model: CLAUDE_HAIKU },
    ci: { agent: "claude", measured: false, model: CLAUDE_HAIKU },
  },
  human_only: HUMAN_ONLY,
};

test("a labelled issue routes to its area's runner", () => {
  assert.deepEqual(routeFor(["area:web", "risk:low"], ROUTING), {
    agent: "claude",
    measured: false,
    model: CLAUDE_HAIKU,
  });
});

test("CI and factory high risk work routes to independent review", () => {
  for (const labels of [
    ["area:ci"],
    ["area:ci", "risk:high"],
    ["area:web", "risk:high", "factory"],
  ]) {
    assert.deepEqual(routeFor(labels, ROUTING), {
      agent: "claude",
      measured: false,
      model: CLAUDE_HAIKU,
    });
  }
});

test("human-only areas, other high risk and invalid areas go to a human", () => {
  for (const labels of [
    ["area:infra", "risk:low"],
    ["area:security"],
    ["area:infra", "risk:high", "factory"],
    ["area:security", "risk:high", "factory"],
    ["area:web", "risk:high"],
    ["risk:low"],
    ["area:web", "area:api"],
    ["area:docs"],
  ])
    assert.equal(routeFor(labels, ROUTING).human, true, labels.join(" "));
});

test("the checked-in routing.json is a complete, parseable route table", () => {
  const routing = JSON.parse(
    readFileSync(join(root, "docs/agents/routing.json"), "utf8")
  );
  assert.equal(routing.version, 1);
  for (const area of ["web", "api", "docs", "ci"]) {
    const route = routing.areas[area];
    assert.ok(route, `${area} route`);
    assert.ok(["claude", "codex"].includes(route.agent), `${area} agent`);
    assert.equal(typeof route.model, "string", `${area} model`);
    assert.equal(typeof route.measured, "boolean", `${area} measured`);
    assert.equal(typeof route.evidence, "string", `${area} evidence`);
  }
  assert.equal(routing.human_only.includes("ci"), false);
  for (const area of ["infra", "security"])
    assert.ok(routing.human_only.includes(area), `${area} is human only`);
});
