import assert from "node:assert/strict";
import test from "node:test";
import {
  branchFromSubject,
  computeFlow,
  formatFlow,
  isoWeek,
  parseChanges,
} from "./flow.mjs";

const CHANGES_MERGED_VIA_RE =
  /2 changes merged \(1 via PR\), 1 reverts \(50\.0%\)/u;
const PER_MERGED_CHANGE_RE =
  /Per merged change: 1k tokens, 3\.0 human prompts/u;
const CHANGES_MERGED_RE = /0 changes merged/u;

const SEP = "\u001f";
const row = (sha, date, parents, subject) =>
  [sha, date, parents, subject].join(SEP);

test("branchFromSubject reads every merge style used on dev", () => {
  assert.equal(
    branchFromSubject(
      "Merge pull request #435 from Marcus100/feat/events-checkout-ui"
    ),
    "feat/events-checkout-ui"
  );
  assert.equal(branchFromSubject("Merge branch 'feat/x' into dev"), "feat/x");
  assert.equal(
    branchFromSubject("Merge remote-tracking branch 'origin/dev'"),
    "dev"
  );
  assert.equal(
    branchFromSubject("Merge docs/observation-network-adr: ADR-0031 store"),
    "docs/observation-network-adr"
  );
  assert.equal(branchFromSubject("feat(x): not a merge"), undefined);
});

test("parseChanges skips sync merges and measures lead time", () => {
  const log = [
    row("a1", "2026-10-20T12:00:00Z", "p1 p2", "Merge feat/x: thing"),
    row(
      "a2",
      "2026-10-20T11:00:00Z",
      "p1 p3",
      "Merge remote-tracking branch 'origin/dev'"
    ),
    row("a3", "2026-10-20T10:00:00Z", "p1", "docs: direct commit"),
    row("a4", "2026-10-20T09:00:00Z", "p1", 'Revert "feat: bad"'),
    row(
      "a5",
      "2026-10-19T09:00:00Z",
      "p1 p9",
      "Merge pull request #7 from o/fix/y"
    ),
  ].join("\n");
  const starts = { a1: "2026-10-20T09:00:00Z", a5: "2026-10-19T08:30:00Z" };
  const changes = parseChanges(log, (sha) => starts[sha]);
  assert.deepEqual(
    changes.map((c) => [c.sha, c.branch, c.leadHours, c.revert, c.pr]),
    [
      ["a1", "feat/x", 3, false, undefined],
      ["a3", undefined, 0, false, undefined],
      ["a4", undefined, 0, true, undefined],
      ["a5", "fix/y", 0.5, false, 7],
    ]
  );
});

test("isoWeek follows ISO-8601 week numbering", () => {
  assert.equal(isoWeek("2026-10-20T12:00:00Z"), "2026-W43");
  assert.equal(isoWeek("2026-01-01T00:00:00Z"), "2026-W01");
  assert.equal(isoWeek("2027-01-01T00:00:00Z"), "2026-W53");
});

const session = (branches, prompts, total, end = "2026-10-20T12:00:00Z") => ({
  agent: "claude",
  branches,
  end,
  minutes: 30,
  model: "claude-sonnet-5-5",
  prompts: new Array(prompts).fill("p"),
  tokens: { total },
});

test("computeFlow gives per-change cost and attributes by branch", () => {
  const changes = [
    {
      branch: "feat/x",
      committed: "2026-10-20T12:00:00Z",
      leadHours: 3,
      revert: false,
      sha: "a",
    },
    {
      branch: "fix/y",
      committed: "2026-10-20T13:00:00Z",
      leadHours: 1,
      revert: false,
      sha: "b",
      pr: 7,
    },
    { committed: "2026-10-20T14:00:00Z", leadHours: 0, revert: true, sha: "c" },
  ];
  const sessions = [
    session({ "feat/x": 600, dev: 400 }, 4, 1000),
    session({ "fix/y": 200 }, 2, 200),
  ];
  const flow = computeFlow({ changes, sessions });
  assert.equal(flow.merged, 2);
  assert.equal(flow.prs, 1);
  assert.equal(flow.reverts, 1);
  assert.equal(flow.revertRate, 0.5);
  assert.equal(flow.perChange.tokens, 600);
  assert.equal(flow.perChange.prompts, 3);
  assert.equal(flow.perChange.activeHours, 0.5);
  assert.equal(flow.leadHours.median, 2);
  const x = flow.changes.find((c) => c.branch === "feat/x");
  assert.equal(x.tokens, 600);
  assert.ok(Math.abs(x.prompts - 2.4) < 1e-9);
  assert.equal(flow.byWeek.length, 1);
  assert.equal(flow.byWeek[0].reverts, 1);
  assert.deepEqual(flow.byModel, { "claude/claude-sonnet-5-5": 1200 });
  const text = formatFlow(flow, { days: 14, ref: "origin/dev" });
  assert.match(text, CHANGES_MERGED_VIA_RE);
  assert.match(text, PER_MERGED_CHANGE_RE);
});

test("computeFlow copes with no changes and no sessions", () => {
  const flow = computeFlow({ changes: [], sessions: [] });
  assert.equal(flow.perChange.tokens, null);
  assert.equal(flow.revertRate, null);
  assert.match(
    formatFlow(flow, { days: 7, ref: "origin/dev" }),
    CHANGES_MERGED_RE
  );
});
