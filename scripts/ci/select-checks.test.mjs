import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import {
  CODEQL_LANGUAGES,
  FULL_LABEL,
  GROUPS,
  MAX_PATHS,
  narrowJobs,
  recordSummary,
  selectChecks,
  selectFromEvent,
  selectionRecord,
  writeShadowRecord,
} from "./select-checks.mjs";

const pr = (paths, extra = {}) =>
  selectChecks(paths, {
    mode: "affected",
    baseRef: "dev",
    rollout: "on",
    ...extra,
  });
const picked = (selection) => GROUPS.filter((group) => selection[group]);
const ALL = [...GROUPS];

// [name, changed paths, groups selected, CodeQL languages]
const table = [
  [
    "docs only",
    ["docs/operations/release-runbook.md", "README.md", "AGENTS.md"],
    [],
    [],
  ],
  [
    "agent skills and nested AGENTS.md",
    [".claude/skills/x/SKILL.md", "apps/web/gms/AGENTS.md"],
    [],
    [],
  ],
  ["blog post", ["apps/web/commit/content/posts/v1-5-0.mdx"], ["webtests"], []],
  [
    "one web app",
    ["apps/web/bookings/src/lib/format.ts", "apps/web/bookings/src/x.css"],
    ["webtests", "journeys"],
    ["javascript-typescript"],
  ],
  [
    "web app that touches the CMS migration setup",
    ["apps/web/cms/src/lib/x.ts"],
    ["storage", "webtests", "journeys"],
    ["javascript-typescript"],
  ],
  [
    "phone app",
    ["apps/pwa/printix/src/app/page.tsx"],
    ["webtests", "journeys"],
    ["javascript-typescript"],
  ],
  [
    "shared package",
    ["packages/ui/src/components/ui/button.tsx"],
    ["storage", "webtests", "journeys"],
    ["javascript-typescript"],
  ],
  [
    "shared package the API tests read",
    ["packages/gms/src/sectors.ts"],
    ["api", "storage", "webtests", "journeys"],
    ["javascript-typescript"],
  ],
  [
    "web route folder the API tests read",
    ["apps/web/bookings/src/app/new-route/page.tsx"],
    ["api", "storage", "webtests", "journeys"],
    ["javascript-typescript"],
  ],
  [
    "API source",
    ["apps/api/fastapi/src/hr/service.py"],
    ["api", "storage", "webtests", "journeys", "apiContract"],
    ["python"],
  ],
  [
    "API tests only",
    ["apps/api/fastapi/tests/hr/test_service.py"],
    ["api", "storage", "apiContract"],
    ["python"],
  ],
  [
    "migration",
    ["apps/api/fastapi/src/hr/alembic/versions/0042_x.py"],
    ["api", "storage", "webtests", "journeys", "apiContract"],
    ["python"],
  ],
  [
    "committed contract",
    ["apps/api/fastapi/openapi.json"],
    ["api", "storage", "webtests", "journeys", "apiContract"],
    [],
  ],
  [
    "API docs",
    ["docs/api/contracts.md"],
    ["api", "storage"],
    [],
  ],
  [
    "port list the API tests read",
    ["docs/ports.md"],
    ["api", "storage"],
    [],
  ],
  [
    "generated client",
    ["packages/api-client/src/gen/types.ts"],
    ["api", "storage", "webtests", "journeys", "apiContract"],
    [],
  ],
  [
    "SURFACE only",
    ["surface/api/tempestas_api/settings.py"],
    [],
    [],
  ],
  ["mixed docs and one app", ["docs/a.md", "apps/web/gms/src/a.ts"], ["webtests", "journeys"], ["javascript-typescript"]],
];

test("table: each change selects only the checks it can affect", () => {
  for (const [name, paths, groups, languages] of table) {
    const selection = pr(paths);
    assert.deepEqual(picked(selection), GROUPS.filter((g) => groups.includes(g)), name);
    assert.deepEqual(selection.codeql, languages, name);
    assert.equal(selection.full, false, name);
  }
});

test("table: everything-paths select every check", () => {
  for (const path of [
    ".github/workflows/ci-api.yml",
    ".github/labeler.yml",
    "scripts/ci/select-checks.mjs",
    "infra/github/rulesets.json",
    "infra/docker/docker-compose.deploy.yml",
    "package.json",
    "apps/web/auth/package.json",
    "pnpm-lock.yaml",
    "pnpm-workspace.yaml",
    "turbo.json",
    "biome.jsonc",
    "tsconfig.base.json",
    "apps/web/auth/tsconfig.json",
    "apps/api/fastapi/Dockerfile.prod",
    "apps/web/cms/Dockerfile",
    "uv.lock",
    "apps/api/fastapi/pyproject.toml",
  ]) {
    const selection = pr([path]);
    assert.deepEqual(picked(selection), ALL, path);
    assert.deepEqual(selection.codeql, CODEQL_LANGUAGES, path);
    assert.equal(selection.full, true, path);
  }
});

test("a path no rule names selects every check", () => {
  for (const path of [
    "scripts/production/smoke-image.sh",
    "scripts/verification/e2e-api.sh",
    "weird-new-top-folder/file.txt",
    "wis2box/x.json",
    "geonetcast/a.py",
    "private-note.txt",
  ])
    assert.equal(pr([path]).full, true, path);
  // One unknown path among known ones is enough.
  assert.equal(pr(["docs/a.md", "scripts/x.sh"]).full, true);
});

test("an empty, unavailable or oversized change list does not narrow", () => {
  assert.equal(pr([]).full, false);
  assert.deepEqual(picked(pr([])), []);
  assert.equal(pr(undefined).full, true);
  assert.equal(pr(null).full, true);
  const huge = Array.from({ length: MAX_PATHS + 1 }, (_, i) => `docs/${i}.md`);
  assert.equal(pr(huge).full, true);
});

test("only a pull request into dev is narrowed", () => {
  const docs = ["docs/a.md"];
  for (const options of [
    { mode: "affected", baseRef: "staging" },
    { mode: "affected", baseRef: "main" },
    { mode: "affected", baseRef: undefined },
    { mode: "full", baseRef: "dev" },
    { mode: "deployment", baseRef: "dev" },
  ]) {
    const selection = selectChecks(docs, options);
    assert.deepEqual(picked(selection), ALL, JSON.stringify(options));
    assert.deepEqual(selection.codeql, CODEQL_LANGUAGES);
  }
});

test("the ci:full label selects everything", () => {
  const selection = pr(["docs/a.md"], { labels: ["docs", FULL_LABEL] });
  assert.deepEqual(picked(selection), ALL);
  assert.deepEqual(picked(pr(["docs/a.md"], { labels: ["docs"] })), []);
});

test("every group has a path that selects it, so none is dead", () => {
  for (const group of GROUPS)
    assert.ok(
      table.some(([, paths]) => picked(pr(paths)).includes(group)),
      group
    );
});

test("narrowJobs replaces only the suite flags, only for dev pull requests", () => {
  const jobs = { python: true, collectors: true, webtests: true, storage: true };
  const event = (base, labels = []) => ({
    pull_request: { base: { ref: base }, labels: labels.map((name) => ({ name })) },
  });
  assert.deepEqual(narrowJobs(jobs, ["apps/web/gms/src/a.ts"], event("dev"), "affected", "on"), {
    python: false,
    collectors: true,
    webtests: true,
    storage: false,
  });
  assert.equal(narrowJobs(jobs, ["apps/web/gms/src/a.ts"], event("staging"), "affected", "on"), jobs);
  assert.equal(narrowJobs(jobs, ["apps/web/gms/src/a.ts"], { before: "a", after: "b" }, "affected", "on"), jobs);
  assert.equal(narrowJobs(jobs, ["apps/web/gms/src/a.ts"], event("dev"), "full", "on"), jobs);
  assert.equal(narrowJobs(jobs, ["docs/a.md"], event("dev", [FULL_LABEL]), "affected", "on").python, true);
});

test("selectFromEvent fails open when the diff cannot be listed", () => {
  const event = {
    pull_request: { base: { ref: "dev", sha: "b" }, head: { sha: "h" }, labels: [] },
  };
  const broken = () => {
    throw new Error("git unavailable");
  };
  const failed = selectFromEvent(event, "pull_request", broken);
  assert.deepEqual(picked(failed), ALL);
  const ok = selectFromEvent(event, "pull_request", (args) =>
    args[0] === "merge-base" ? "m\n" : "docs/a.md\0",
    "on"
  );
  assert.deepEqual(picked(ok), []);
  // Scheduled, manual and push events never call git and run everything.
  const never = () => assert.fail("no diff needed");
  for (const name of ["schedule", "workflow_dispatch", "push"])
    assert.deepEqual(picked(selectFromEvent({}, name, never)), ALL, name);
});

test("the standalone entry point never fails and writes every output", () => {
  const dir = mkdtempSync(join(tmpdir(), "select-checks-"));
  try {
    const run = (eventBody) => {
      const output = join(dir, "output");
      const eventPath = join(dir, "event.json");
      writeFileSync(output, "");
      writeFileSync(eventPath, eventBody);
      const result = spawnSync(
        process.execPath,
        [fileURLToPath(new URL("./select-checks.mjs", import.meta.url))],
        {
          cwd: dir,
          env: { ...process.env, GITHUB_EVENT_PATH: eventPath, GITHUB_OUTPUT: output, GITHUB_EVENT_NAME: "pull_request" },
        }
      );
      assert.equal(result.status, 0, String(result.stderr));
      return Object.fromEntries(
        readFileSync(output, "utf8").trim().split("\n").map((line) => line.split(/=(.*)/su).slice(0, 2))
      );
    };
    // No git repository here: the diff fails, so everything runs.
    const failed = run(
      JSON.stringify({ pull_request: { base: { ref: "dev", sha: "b" }, head: { sha: "h" }, labels: [] } })
    );
    for (const group of GROUPS) assert.equal(failed[group], "true", group);
    assert.equal(failed.codeql, JSON.stringify(CODEQL_LANGUAGES));
    // An unreadable event also selects everything.
    const garbage = run("not json");
    for (const group of GROUPS) assert.equal(garbage[group], "true", group);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("rollout: off and shadow run every check, on narrows", () => {
  const docs = ["docs/a.md"];
  const run = (rollout) =>
    selectChecks(docs, { mode: "affected", baseRef: "dev", rollout });
  for (const rollout of ["off", "shadow", undefined, "", "bogus", "SHADOW"]) {
    const selection = run(rollout);
    assert.deepEqual(picked(selection), ALL, String(rollout));
    assert.deepEqual(selection.codeql, CODEQL_LANGUAGES);
  }
  assert.equal(run(undefined).rollout, "shadow");
  assert.equal(run("bogus").rollout, "shadow");
  assert.equal(run("off").rollout, "off");
  assert.equal(run("off").would, undefined);
  assert.deepEqual(picked(run("on")), []);
  assert.equal(run("On").rollout, "on");
  // Shadow remembers the decision `on` would take.
  assert.deepEqual(picked(run("shadow").would), []);
  assert.deepEqual(
    selectChecks(["apps/web/gms/src/a.ts"], { baseRef: "dev" }).would.codeql,
    ["javascript-typescript"]
  );
});

test("rollout: events other than a dev pull request never record or narrow", () => {
  for (const rollout of ["off", "shadow", "on"]) {
    const selection = selectChecks(["docs/a.md"], {
      mode: "affected",
      baseRef: "staging",
      rollout,
    });
    assert.deepEqual(picked(selection), ALL, rollout);
    assert.equal(selection.would, undefined, rollout);
  }
});

test("rollout: narrowJobs changes nothing unless the rollout is on", () => {
  const jobs = { python: true, collectors: false, webtests: true, storage: true };
  const event = { pull_request: { base: { ref: "dev" }, labels: [] } };
  const paths = ["apps/web/gms/src/a.ts"];
  for (const rollout of [undefined, "shadow", "off"])
    assert.equal(narrowJobs(jobs, paths, event, "affected", rollout), jobs, String(rollout));
  assert.equal(narrowJobs(jobs, paths, event, "affected", "on").python, false);
});

test("shadow record lists what would be skipped", () => {
  const event = {
    pull_request: { number: 7, head: { sha: "abc" }, base: { ref: "dev" }, labels: [] },
  };
  const selection = selectChecks(["apps/web/gms/src/a.ts"], { baseRef: "dev" });
  const record = selectionRecord(selection, event);
  assert.equal(record.pr, 7);
  assert.equal(record.headSha, "abc");
  assert.deepEqual(record.wouldSkip, ["api", "storage", "apiContract", "codeql:python"]);
  assert.match(recordSummary(record), /- api\n/u);
  // No record outside shadow mode or without a pull request.
  assert.equal(selectionRecord(selectChecks(["x"], { baseRef: "dev", rollout: "on" }), event), null);
  assert.equal(selectionRecord(selection, {}), null);
});

test("writeShadowRecord writes the JSON file and the job summary", () => {
  const dir = mkdtempSync(join(tmpdir(), "shadow-record-"));
  try {
    const event = {
      pull_request: { number: 9, head: { sha: "def" }, base: { ref: "dev" }, labels: [] },
    };
    const file = join(dir, "ci-selection.json");
    const summary = join(dir, "summary.md");
    const selection = selectChecks(["docs/a.md"], { baseRef: "dev" });
    writeShadowRecord(selection, event, { file, summary });
    assert.equal(JSON.parse(readFileSync(file, "utf8")).pr, 9);
    assert.match(readFileSync(summary, "utf8"), /Check selection \(shadow\)/u);
    assert.equal(writeShadowRecord(selection, {}, { file: join(dir, "no"), summary }), null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
