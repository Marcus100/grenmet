import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const MISSING_TOOL = /pg_dump is not installed or is not on PATH/;
const PRIVATE_OUTPUT =
  /private-test-password|private-reference-password|ECONNREFUSED/;

test("missing pg_dump is actionable before database access and does not expose credentials", () => {
  const directory = mkdtempSync(join(tmpdir(), "cms-adopt-test-"));
  try {
    const result = spawnSync(
      process.execPath,
      [fileURLToPath(new URL("./adopt.mjs", import.meta.url))],
      {
        env: {
          ...process.env,
          PATH: directory,
          DATABASE_URL:
            "postgresql://cms:private-test-password@127.0.0.1:1/gms_cms",
          CMS_BASELINE_REFERENCE_URL:
            "postgresql://cms:private-reference-password@127.0.0.1:1/cms_reference",
        },
        encoding: "utf8",
        timeout: 15_000,
      }
    );
    assert.notEqual(result.status, 0);
    const output = result.stdout + result.stderr;
    assert.match(output, MISSING_TOOL);
    assert.doesNotMatch(output, PRIVATE_OUTPUT);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
