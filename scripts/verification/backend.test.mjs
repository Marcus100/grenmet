import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./backend.sh", import.meta.url));

test("backend verification requests an isolated environment and preserves test failures", () => {
  const dir = mkdtempSync(join(tmpdir(), "backend-verification-"));
  try {
    const log = join(dir, "arguments.json");
    writeFileSync(
      join(dir, "uv"),
      `#!/usr/bin/env node
require("node:fs").writeFileSync(process.env.CALL_LOG, JSON.stringify(process.argv.slice(2)));
process.exit(23);
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
          POSTGRES_SERVER: "disposable.invalid",
          POSTGRES_USER: "verification",
          POSTGRES_PASSWORD: "test-only",
        },
        encoding: "utf8",
      }
    );
    assert.equal(result.status, 23, result.stderr);
    const args = JSON.parse(readFileSync(log, "utf8"));
    assert.ok(
      args.includes("--isolated"),
      "must not synchronize the shared .venv"
    );
    assert.ok(args.includes("--frozen"));
    assert.equal(args.at(-1), "tests/test_openapi_contract.py");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
