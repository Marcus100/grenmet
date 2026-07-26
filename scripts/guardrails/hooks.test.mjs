import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
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

const workspace = fileURLToPath(new URL("../../", import.meta.url));
const lintStagedConfig = join(workspace, ".lintstagedrc.mjs");
const prePushHook = join(workspace, ".husky/pre-push");

const run = (command, args, options = {}) =>
  spawnSync(command, args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
  });

const git = (repository, ...args) => {
  const result = run("git", args, { cwd: repository });
  assert.equal(
    result.status,
    0,
    `git ${args.join(" ")} failed:\n${result.stderr}`
  );
  return result.stdout;
};

test("lint-staged formats only staged files and preserves unstaged edits", (t) => {
  const repository = mkdtempSync(join(workspace, ".lint-staged-test-"));
  t.after(() => rmSync(repository, { recursive: true, force: true }));
  git(repository, "init", "--quiet", "--initial-branch=main");
  git(repository, "config", "user.email", "hooks@example.com");
  git(repository, "config", "user.name", "Hook Tests");

  const stagedFile = join(repository, "staged.js");
  const unstagedFile = join(repository, "unstaged.js");
  const ignoredFile = join(repository, "notes.md");
  writeFileSync(stagedFile, "export const answer = 1;\n");
  writeFileSync(unstagedFile, "const untouched={value:1}\n");
  writeFileSync(ignoredFile, "#Title\n");
  git(repository, "add", ".");
  git(repository, "commit", "--quiet", "-m", "initial");

  writeFileSync(stagedFile, "export const answer={value:1}\n");
  writeFileSync(ignoredFile, "#Changed\n");
  git(repository, "add", "staged.js", "notes.md");
  writeFileSync(
    stagedFile,
    "export const answer={value:1}\nconst unstaged={keep:true}\n"
  );

  const result = run(
    "pnpm",
    ["exec", "lint-staged", "--cwd", repository, "--config", lintStagedConfig],
    { cwd: workspace }
  );

  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.equal(
    git(repository, "show", ":staged.js"),
    "export const answer = { value: 1 };\n"
  );
  assert.equal(
    readFileSync(stagedFile, "utf8"),
    "export const answer = { value: 1 };\nconst unstaged={keep:true}\n"
  );
  assert.equal(
    readFileSync(unstagedFile, "utf8"),
    "const untouched={value:1}\n"
  );
  assert.equal(git(repository, "show", ":notes.md"), "#Changed\n");
});

test("pre-push stops on type-check and test failures", (t) => {
  const fixture = mkdtempSync(join(tmpdir(), "grenmet-pre-push-"));
  t.after(() => rmSync(fixture, { recursive: true, force: true }));
  const bin = join(fixture, "bin");
  const log = join(fixture, "calls.log");
  mkdirSync(bin);

  const pnpm = join(bin, "pnpm");
  writeFileSync(
    pnpm,
    [
      "#!/bin/sh",
      'printf "%s\\n" "$*" >> "$CALL_LOG"',
      'if [ "$1" = "$FAIL_STEP" ]; then',
      "  exit 1",
      "fi",
      "",
    ].join("\n")
  );
  chmodSync(pnpm, 0o755);

  const hookEnvironment = {
    CALL_LOG: log,
    PATH: `${bin}:${process.env.PATH}`,
  };

  let result = run("sh", ["-e", prePushHook], {
    cwd: workspace,
    env: { ...hookEnvironment, FAIL_STEP: "type-check" },
  });
  assert.equal(result.status, 1);
  assert.equal(readFileSync(log, "utf8"), "type-check\n");

  writeFileSync(log, "");
  result = run("sh", ["-e", prePushHook], {
    cwd: workspace,
    env: { ...hookEnvironment, FAIL_STEP: "test" },
  });
  assert.equal(result.status, 1);
  assert.equal(readFileSync(log, "utf8"), "type-check\ntest\n");
});
