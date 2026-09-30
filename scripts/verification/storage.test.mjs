import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const cwd = fileURLToPath(new URL("../../", import.meta.url));

function runStorage(integrationExit = 0) {
  const directory = mkdtempSync(join(tmpdir(), "storage-entrypoint-"));
  const log = join(directory, "calls");
  try {
    for (const command of ["pnpm", "node", "psql"]) {
      writeFileSync(
        join(directory, command),
        `#!/bin/bash\nprintf '%s|%s|%s\\n' "${command}" "$*" "\${CMS_TEST_DATABASE_URL:-}" >> "$TEST_CALLS"\nif [[ "$*" == *editorial.integration.test.ts* ]]; then exit "$INTEGRATION_EXIT"; fi\n`,
        { mode: 0o755 }
      );
    }
    const result = spawnSync("bash", ["scripts/verification/storage.sh"], {
      cwd,
      encoding: "utf8",
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        TEST_CALLS: log,
        STORAGE_TEST_POSTGRES_URL:
          "postgresql://test-only@localhost/disposable",
        CMS_TEST_DATABASE_URL: "postgresql://unrelated@localhost/do-not-use",
        INTEGRATION_EXIT: String(integrationExit),
      },
    });
    return { ...result, calls: readFileSync(log, "utf8") };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test("storage verification runs editorial integration against its explicit disposable service", () => {
  const result = runStorage();
  assert.equal(result.status, 0, result.stderr);
  assert.ok(
    result.calls.includes(
      "pnpm|--filter @barrelsgd/web-cms exec vitest run src/editorial.integration.test.ts|postgresql://test-only@localhost/disposable"
    ),
    result.calls
  );
});

test("an editorial integration failure fails storage verification", () => {
  const result = runStorage(23);
  assert.equal(result.status, 23, result.stderr);
});
