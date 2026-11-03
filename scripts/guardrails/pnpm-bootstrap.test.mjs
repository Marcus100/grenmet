import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const bootstrap = fileURLToPath(
  new URL("../../.github/actions/setup-node/bootstrap-pnpm.sh", import.meta.url)
);
const WARNING = /failed or timed out/gu;

function fixture(t, failures, manager = "pnpm@12.3.4") {
  const root = mkdtempSync(join(tmpdir(), "pnpm-bootstrap-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const bin = join(root, "bin");
  mkdirSync(bin);
  writeFileSync(
    join(root, "package.json"),
    JSON.stringify({ packageManager: manager })
  );
  const executable = (name, text) =>
    writeFileSync(join(bin, name), `#!/bin/sh\n${text}\n`, { mode: 0o755 });
  executable(
    "timeout",
    'printf "%s\\n" "$*" >> "$TEST_TIMEOUT_LOG"\nshift 2\nexec "$@"'
  );
  executable(
    "corepack",
    [
      'if [ "$1" = enable ]; then exit 0; fi',
      'count=0; [ ! -f "$TEST_COUNT" ] || count=$(cat "$TEST_COUNT")',
      'count=$((count + 1)); printf "%s" "$count" > "$TEST_COUNT"',
      'printf "%s\\n" "$*" >> "$TEST_INSTALL_LOG"',
      '[ "$count" -gt "$TEST_FAILURES" ]',
    ].join("\n")
  );
  executable("sleep", "exit 0");
  executable("pnpm", 'echo "12.3.4"');
  const count = join(root, "count");
  const timeouts = join(root, "timeouts");
  const installs = join(root, "installs");
  const result = spawnSync("bash", [bootstrap], {
    cwd: root,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      TEST_FAILURES: String(failures),
      TEST_COUNT: count,
      TEST_TIMEOUT_LOG: timeouts,
      TEST_INSTALL_LOG: installs,
    },
  });
  return { result, count, timeouts, installs };
}

test("pnpm bootstrap retries transient failures and pins every bounded attempt", (t) => {
  const { result, count, timeouts, installs } = fixture(t, 2);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(readFileSync(count, "utf8"), "3");
  assert.deepEqual(readFileSync(timeouts, "utf8").trim().split("\n"), [
    ...new Array(3).fill(
      "--kill-after=5s 90s corepack install --global pnpm@12.3.4"
    ),
    "--kill-after=5s 15s pnpm --version",
  ]);
  assert.deepEqual(
    readFileSync(installs, "utf8").trim().split("\n"),
    new Array(3).fill("install --global pnpm@12.3.4")
  );
});

test("pnpm bootstrap fails after three attempts instead of concealing registry failure", (t) => {
  const { result, count } = fixture(t, 99);
  assert.equal(result.status, 1);
  assert.equal(readFileSync(count, "utf8"), "3");
  assert.equal([...result.stdout.matchAll(WARNING)].length, 3);
});

test("pnpm bootstrap succeeds on its first working attempt and rejects another manager", (t) => {
  assert.equal(readFileSync(fixture(t, 0).count, "utf8"), "1");
  const { result } = fixture(t, 0, "npm@11.0.0");
  assert.equal(result.status, 1);
});
