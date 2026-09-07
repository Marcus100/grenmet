import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const script = fileURLToPath(new URL("./smoke-image.sh", import.meta.url));
function run(
  kind,
  failedHealth = false,
  failedImport = false,
  failedPage = false
) {
  const dir = mkdtempSync(join(tmpdir(), "image-smoke-"));
  try {
    writeFileSync(
      join(dir, "docker"),
      `#!/bin/sh
printf '%s\n' "$*" >> "$SMOKE_LOG"
case "$1" in
run) if [ "$2" = "-d" ]; then echo test-container; else exit "$IMPORT_STATUS"; fi ;;
port) echo 127.0.0.1:12345 ;;
esac
`,
      { mode: 0o700 }
    );
    writeFileSync(join(dir, "curl"), '#!/bin/sh\nexit "$CURL_STATUS"\n', {
      mode: 0o700,
    });
    writeFileSync(join(dir, "sleep"), "#!/bin/sh\nexit 0\n", { mode: 0o700 });
    writeFileSync(
      join(dir, "node"),
      '#!/bin/sh\nprintf "page-check\\n" >> "$SMOKE_LOG"\ncat >> "$SMOKE_LOG"\nexit "$PAGE_STATUS"\n',
      { mode: 0o700 }
    );
    const log = join(dir, "calls");
    writeFileSync(log, "");
    const result = spawnSync(
      "bash",
      [script, "example@sha256:abc", kind, "3000"],
      {
        env: {
          ...process.env,
          PATH: `${dir}:${process.env.PATH}`,
          SMOKE_LOG: log,
          CURL_STATUS: failedHealth ? "1" : "0",
          IMPORT_STATUS: failedImport ? "1" : "0",
          PAGE_STATUS: failedPage ? "1" : "0",
        },
      }
    );
    return { status: result.status, calls: readFileSync(log, "utf8") };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
test("web smoke cleans up its container on success and health failure", () => {
  for (const failed of [false, true]) {
    const result = run("web", failed);
    assert.equal(result.status, failed ? 1 : 0);
    assert.ok(result.calls.includes("rm -f test-container"));
    assert.ok(result.calls.includes("127.0.0.1::3000"));
  }
});
test("API and migration checks propagate import failures without network access", () => {
  for (const kind of ["api", "cms-migrate", "admin-migrate"]) {
    assert.equal(run(kind).status, 0);
    const failed = run(kind, false, true);
    assert.equal(failed.status, 1);
    assert.ok(failed.calls.includes("--network none"));
  }
});
test("unknown smoke kind fails closed", () =>
  assert.equal(run("typo").status, 2));

test("auth requires the server-rendered form after health succeeds and cleans up on failure", () => {
  for (const failed of [false, true]) {
    const result = run("auth", false, false, failed);
    assert.equal(result.status, failed ? 1 : 0);
    assert.ok(result.calls.includes("page-check"));
    assert.ok(result.calls.includes("<form"));
    assert.ok(result.calls.includes("rm -f test-container"));
  }
  assert.ok(!run("auth", true).calls.includes("page-check"));
});
