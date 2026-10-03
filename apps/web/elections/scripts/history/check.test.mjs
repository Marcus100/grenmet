import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { checkHistory } from "./check.mjs";

function fixture(t) {
  const root = mkdtempSync(path.join(os.tmpdir(), "elections-history-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  for (const folder of [
    "src/data/source",
    "src/data/derived",
    "public/data",
    "scripts/history",
  ])
    mkdirSync(path.join(root, folder), { recursive: true });
  const input = "src/data/source/record.json";
  const output = "public/data/master_contests.csv";
  const hash = (text) => createHash("sha256").update(text).digest("hex");
  writeFileSync(path.join(root, input), "{}");
  writeFileSync(path.join(root, output), "votes\n1\n");
  writeFileSync(
    path.join(root, "src/data/derived/manifest.json"),
    JSON.stringify({
      inputs: { [input]: hash("{}") },
      outputs: { [output]: hash("votes\n1\n") },
    })
  );
  return { root, input, output };
}

test("detects edited sources and stale or missing exports", (t) => {
  const { root, input, output } = fixture(t);
  assert.deepEqual(checkHistory(root), []);
  writeFileSync(path.join(root, input), '{"votes":2}');
  writeFileSync(path.join(root, output), "votes\n2\n");
  assert.deepEqual(checkHistory(root), [
    `Changed inputs: ${input}`,
    `Changed outputs: ${output}`,
  ]);
  rmSync(path.join(root, output));
  assert.ok(checkHistory(root).includes(`Missing outputs: ${output}`));
});

test("new archive records require rebuilding; campaign edits do not", (t) => {
  const { root } = fixture(t);
  writeFileSync(path.join(root, "src/data/source/campaign.json"), "{}");
  assert.deepEqual(checkHistory(root), []);
  writeFileSync(path.join(root, "src/data/source/new-year.json"), "{}");
  assert.deepEqual(checkHistory(root), [
    "Unrecorded inputs: src/data/source/new-year.json",
  ]);
});

test("Git line-ending normalization does not invalidate the archive", (t) => {
  const { root, output } = fixture(t);
  writeFileSync(path.join(root, output), "votes\r\n1\r\n");
  assert.deepEqual(checkHistory(root), []);
});
