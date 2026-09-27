import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./collectors.sh", import.meta.url));
const WXWATCH =
  /\/scripts\/scrapy-wxwatch\|run --isolated --frozen --package wxwatch python -m pytest tests$/;
const SUTRON =
  /\/scripts\/sutron-collector\|run --isolated --frozen --package sutron-collector python -m pytest tests$/;
const INGEST =
  /\/scripts\/gms-ingest\|run --isolated --frozen --package gms-ingest python -m unittest discover -s tests -v$/;
test("collector verification runs each suite from its own project in isolation", () => {
  const dir = mkdtempSync(join(tmpdir(), "collector-test-"));
  try {
    const log = join(dir, "calls");
    writeFileSync(
      join(dir, "uv"),
      '#!/bin/sh\nprintf "%s|%s\\n" "$PWD" "$*" >> "$CALL_LOG"\n',
      { mode: 0o755 }
    );
    const result = spawnSync("bash", [script], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        CALL_LOG: log,
      },
      encoding: "utf8",
    });
    assert.equal(result.status, 0, result.stderr);
    const calls = readFileSync(log, "utf8").trim().split("\n");
    assert.equal(calls.length, 3);
    assert.match(calls[0], WXWATCH);
    assert.match(calls[1], SUTRON);
    assert.match(calls[2], INGEST);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("collector suite failures stop verification and preserve the failing exit code", () => {
  const dir = mkdtempSync(join(tmpdir(), "collector-failure-"));
  try {
    const log = join(dir, "calls");
    writeFileSync(
      join(dir, "uv"),
      '#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALL_LOG"\nexit 23\n',
      { mode: 0o755 }
    );
    const result = spawnSync("bash", [script], {
      cwd: dir,
      env: {
        ...process.env,
        PATH: `${dir}:${process.env.PATH}`,
        CALL_LOG: log,
      },
    });
    assert.equal(result.status, 23);
    assert.equal(readFileSync(log, "utf8").trim().split("\n").length, 1);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
