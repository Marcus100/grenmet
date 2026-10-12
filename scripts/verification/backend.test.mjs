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

const script = fileURLToPath(new URL("./backend.sh", import.meta.url));

for (const failedStage of ["", "sync", "run"]) {
  test(`backend verification isolates both packages and preserves ${failedStage || "successful"} results`, () => {
    const dir = mkdtempSync(join(tmpdir(), "backend-verification-"));
    try {
      const log = join(dir, "arguments.jsonl");
      const developmentEnv = join(dir, "development-venv");
      writeFileSync(
        join(dir, "uv"),
        `#!/usr/bin/env node
const args = process.argv.slice(2);
require("node:fs").appendFileSync(process.env.CALL_LOG, JSON.stringify({ args, environment: process.env.UV_PROJECT_ENVIRONMENT }) + "\\n");
process.exit(args[0] === process.env.FAILED_STAGE ? 23 : 0);
`,
        { mode: 0o755 }
      );
      const result = spawnSync(
        "bash",
        [script, "tests/test_openapi_contract.py"],
        {
          env: {
            ...process.env,
            PATH: `${dir}:${process.env.PATH}`,
            CALL_LOG: log,
            FAILED_STAGE: failedStage,
            UV_PROJECT_ENVIRONMENT: developmentEnv,
            POSTGRES_SERVER: "disposable.invalid",
            POSTGRES_USER: "verification",
            POSTGRES_PASSWORD: "test-only",
          },
          encoding: "utf8",
        }
      );
      assert.equal(result.status, failedStage ? 23 : 0, result.stderr);
      const calls = readFileSync(log, "utf8")
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line));
      assert.equal(calls.length, failedStage === "sync" ? 1 : 2);
      assert.deepEqual(calls[0].args, [
        "sync",
        "--frozen",
        "--package",
        "fast-back",
        "--package",
        "gms-ingest",
      ]);
      const environment = calls[0].environment;
      assert.notEqual(environment, developmentEnv);
      assert.equal(
        existsSync(join(environment, "..")),
        false,
        "owned environment must be cleaned up on success or failure"
      );
      if (calls.length === 2) {
        assert.equal(calls[1].environment, environment);
        assert.deepEqual(calls[1].args.slice(0, 5), [
          "run",
          "--no-sync",
          "--package",
          "fast-back",
          "pytest",
        ]);
        assert.equal(calls[1].args.at(-1), "tests/test_openapi_contract.py");
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
}
