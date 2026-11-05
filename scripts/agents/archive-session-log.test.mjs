/* biome-ignore-all lint/performance/useTopLevelRegex: Diagnostic regexes run once per isolated test. */

import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { parseEntries, splitLog } from "./archive-session-log.mjs";

const NOW = Date.UTC(2026, 9, 13, 12);
const SCRIPT = fileURLToPath(
  new URL("./archive-session-log.mjs", import.meta.url)
);
const LOG = [
  "tail of an entry whose header was truncated",
  "- 2026-09-28T10:00:00Z Codex: old dash entry",
  "  continuation of the old entry",
  "2026-10-03T21:52:15Z Claude Code: older nodash entry",
  "2026-10-07T01:00:00.123+00:00 | Codex | boundary day",
  "2026-10-12T16:16:26+00:00 | Codex | recent pipe entry",
  "  recent continuation",
  "- 2026-10-13T09:00:00Z Claude Code: today",
].join("\n");

test("parses both entry styles and keeps continuations with their entry", () => {
  const { entries, preamble } = parseEntries(LOG);
  assert.equal(entries.length, 5);
  assert.deepEqual(preamble, ["tail of an entry whose header was truncated"]);
  assert.equal(entries[0].lines.length, 2);
  assert.equal(entries[0].month, "2026-09");
});

test("archives entries older than the window by calendar day, grouped by month", () => {
  const result = splitLog(LOG, { days: 7, now: NOW });
  assert.equal(result.archived, 2);
  assert.deepEqual([...result.archive.keys()], ["2026-09", "2026-10"]);
  assert.match(result.archive.get("2026-09"), /continuation of the old entry/u);
  assert.ok(!result.kept.includes("older nodash entry"));
  assert.ok(result.kept.includes("boundary day"));
  assert.equal(result.keptCount, 3);
});

test("never loses text: kept plus archived lines cover the original", () => {
  const result = splitLog(LOG, { days: 7, now: NOW });
  const recovered = [result.kept, ...[...result.archive.values()]]
    .join("\n")
    .split("\n")
    .sort();
  assert.deepEqual(recovered, LOG.split("\n").sort());
});

test("keeps the preamble and archives nothing when every entry is recent", () => {
  const result = splitLog(LOG, { days: 365, now: NOW });
  assert.equal(result.archived, 0);
  assert.equal(result.kept, LOG);
});

function withLog(t, body) {
  const dir = mkdtempSync(join(tmpdir(), "session-log-"));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  const log = join(dir, "SESSION_LOG.md");
  writeFileSync(log, body);
  return { archive: join(dir, "SESSION_LOG.archive"), log };
}

const run = (log, ...args) =>
  spawnSync("node", [SCRIPT, "--log", log, ...args], { encoding: "utf8" });

test("dry run changes nothing; --write archives and is idempotent", (t) => {
  const old = "2020-01-02T00:00:00Z Codex: ancient\n  detail";
  const fresh = `${new Date().toISOString()} Claude Code: now`;
  const { archive, log } = withLog(t, `${old}\n${fresh}\n`);

  const dry = run(log);
  assert.equal(dry.status, 0, dry.stderr);
  assert.match(dry.stdout, /would archive 1 entry/u);
  assert.equal(readFileSync(log, "utf8"), `${old}\n${fresh}\n`);
  assert.ok(!existsSync(archive));

  const first = run(log, "--write");
  assert.equal(first.status, 0, first.stderr);
  assert.equal(readFileSync(log, "utf8"), `${fresh}\n`);
  assert.equal(readFileSync(join(archive, "2020-01.md"), "utf8"), `${old}\n`);

  const second = run(log, "--write");
  assert.match(second.stdout, /archived 0 entries/u);
  assert.equal(readFileSync(join(archive, "2020-01.md"), "utf8"), `${old}\n`);
});

test("a rerun after a crash does not duplicate archived entries", (t) => {
  const old = "2020-01-02T00:00:00Z Codex: ancient";
  const { archive, log } = withLog(t, `${old}\n`);
  assert.equal(run(log, "--write").status, 0);
  // Simulate a crash before the log was rewritten: the entry is back in the log.
  writeFileSync(log, `${old}\n`);
  assert.equal(run(log, "--write").status, 0);
  assert.equal(readFileSync(join(archive, "2020-01.md"), "utf8"), `${old}\n`);
});

test("rejects bad arguments", () => {
  assert.equal(run("/nonexistent", "--days", "0").status, 2);
  assert.equal(run("/nonexistent", "--nope").status, 2);
});
