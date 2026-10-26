import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { groupObservations } from "./audit-checks.mjs";
import { command } from "./audit-process.mjs";
import { executePlan } from "./audit-worker.mjs";

const item = (key, status, severity = "normal") => ({
  key,
  status,
  severity,
  owner: "Claude",
  title: "A structured finding",
  command: "read-only check",
  summary: "Safe count only.",
});
test("one root cause stays open while any grouped observation fails or remains unknown", () => {
  assert.equal(
    groupObservations([
      item("vulnerability", "pass"),
      item("vulnerability", "fail", "high"),
    ])[0].status,
    "fail"
  );
  const combined = groupObservations(
    [item("one", "pass"), item("two", "unknown")],
    { one: "root-cause", two: "root-cause" }
  );
  assert.equal(combined.length, 1);
  assert.equal(combined[0].status, "unknown");
  assert.equal(combined[0].key, "root-cause");
  assert.equal(
    groupObservations([item("one", "pass"), item("two", "pass")], {
      one: "root-cause",
      two: "root-cause",
    })[0].status,
    "pass"
  );
});
test("a report-only dead-code scan distinguishes empty findings and unavailable output", async () => {
  const plan = [{ id: "scan", argv: ["knip"], reportOnly: true }];
  const clean = await executePlan(plan, "/unused", "/unused", async () => ({
    code: 0,
    stdout: '{"files":[],"issues":[]}',
  }));
  assert.equal(clean[0].status, "pass");
  const findings = await executePlan(plan, "/unused", "/unused", async () => ({
    code: 0,
    stdout: '{"files":["example.ts"],"issues":[]}',
  }));
  assert.equal(findings[0].status, "fail");
  const invalid = await executePlan(plan, "/unused", "/unused", async () => ({
    code: 0,
    stdout: "not a structured report",
  }));
  assert.equal(invalid[0].status, "fail");
});
test("command timeouts stop the child and retain a bounded capture", async () => {
  const directory = mkdtempSync(join(tmpdir(), "audit-command-"));
  try {
    const result = await command(
      [
        process.execPath,
        "-e",
        'process.stdout.write("abcdef");setInterval(()=>{},1000)',
      ],
      {
        timeout: 1000,
        logPath: join(directory, "private.log"),
        captureLimit: 3,
      }
    );
    assert.equal(result.code, 124);
    assert.equal(result.timedOut, true);
    assert.ok(result.stdout.length <= 3);
    const capture = await command(
      [process.execPath, "-e", 'process.stdout.write("abcdef")'],
      { timeout: 30_000, captureLimit: 3 }
    );
    assert.equal(capture.stdout, "def");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
