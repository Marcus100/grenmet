import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  claimLock,
  listLocks,
  releaseLock,
  sweepLocks,
} from "./claim-issue.mjs";

const SCRIPT = fileURLToPath(new URL("./claim-issue.mjs", import.meta.url));
const HOUR_MS = 3_600_000;
const HELD_BY_ALPHA = /already claimed \(agent lock for #7 by alpha/;
const HELD_BY_NEXT = /by next/;
const NO_LOCK = /no lock to release/;
const REFUSED = /remote refused.*pnpm agents:sweep/;

function git(cwd, ...args) {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" });
  assert.equal(result.status, 0, `git ${args.join(" ")}: ${result.stderr}`);
  return result.stdout.trim();
}

// A bare "origin" plus any number of independent clones, like parallel runners.
function createRemote(t, clones = 1) {
  const root = mkdtempSync(join(tmpdir(), "claim-issue-"));
  t.after(() => rmSync(root, { force: true, recursive: true }));
  const origin = join(root, "origin.git");
  git(root, "init", "--quiet", "--bare", origin);
  const seed = join(root, "seed");
  git(root, "init", "--quiet", seed);
  git(seed, "config", "user.email", "t@example.com");
  git(seed, "config", "user.name", "t");
  writeFileSync(join(seed, "README.md"), "seed\n");
  git(seed, "add", ".");
  git(seed, "commit", "--quiet", "-m", "seed");
  git(seed, "push", "--quiet", origin, "HEAD:refs/heads/main");
  const workdirs = [];
  for (let i = 0; i < clones; i++) {
    const dir = join(root, `clone-${i}`);
    git(root, "clone", "--quiet", origin, dir);
    workdirs.push(dir);
  }
  return { origin, workdirs };
}

const remoteLocks = (origin) =>
  git(origin, "for-each-ref", "--format=%(refname)", "refs/heads/agent-lock/");

function run(cwd, args) {
  return new Promise((resolve) => {
    const child = spawn("node", [SCRIPT, ...args, "--no-label"], { cwd });
    let stdout = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.on("close", (status) => resolve({ status, stdout }));
  });
}

test("the first claim wins and a second claim is refused with exit code 3", async (t) => {
  const { workdirs } = createRemote(t, 2);
  const first = await run(workdirs[0], ["claim", "7", "--as", "alpha"]);
  const second = await run(workdirs[1], ["claim", "7", "--as", "beta"]);
  assert.equal(first.status, 0);
  assert.equal(second.status, 3);
  assert.match(second.stdout, HELD_BY_ALPHA);
});

test("five simultaneous claimants: exactly one wins", async (t) => {
  const { origin, workdirs } = createRemote(t, 5);
  const results = await Promise.all(
    workdirs.map((dir, i) => run(dir, ["claim", "42", "--as", `runner-${i}`]))
  );
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [0, 3, 3, 3, 3]);
  assert.equal(remoteLocks(origin), "refs/heads/agent-lock/42");
});

test("different issues can be claimed in parallel", async (t) => {
  const { workdirs } = createRemote(t, 2);
  const [a, b] = await Promise.all([
    run(workdirs[0], ["claim", "1"]),
    run(workdirs[1], ["claim", "2"]),
  ]);
  assert.deepEqual([a.status, b.status], [0, 0]);
});

test("release frees the issue for the next claimant", async (t) => {
  const { origin, workdirs } = createRemote(t, 2);
  assert.equal((await run(workdirs[0], ["claim", "9"])).status, 0);
  const released = await run(workdirs[0], ["release", "9"]);
  assert.equal(released.status, 0);
  assert.equal(remoteLocks(origin), "");
  assert.equal((await run(workdirs[1], ["claim", "9"])).status, 0);
});

test("releasing a lock that does not exist is harmless", async (t) => {
  const { workdirs } = createRemote(t);
  const result = await run(workdirs[0], ["release", "5"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, NO_LOCK);
});

test("a stale lock is taken over, a fresh one is not", (t) => {
  const { workdirs } = createRemote(t, 2);
  const now = Date.now();
  const old = claimLock({
    claimant: "crashed",
    cwd: workdirs[0],
    issue: 11,
    now: now - 24 * HOUR_MS,
  });
  assert.equal(old.claimed, true);

  const takeover = claimLock({
    claimant: "next",
    cwd: workdirs[1],
    issue: 11,
    now,
    staleHours: 12,
  });
  assert.deepEqual(takeover, { claimed: true, stolen: true });

  const blocked = claimLock({
    claimant: "third",
    cwd: workdirs[0],
    issue: 11,
    now,
    staleHours: 12,
  });
  assert.equal(blocked.claimed, false);
  assert.match(blocked.heldBy, HELD_BY_NEXT);
});

test("the library API claims and releases", (t) => {
  const { workdirs } = createRemote(t);
  const cwd = workdirs[0];
  assert.equal(claimLock({ claimant: "a", cwd, issue: 3 }).claimed, true);
  assert.equal(claimLock({ claimant: "b", cwd, issue: 3 }).claimed, false);
  assert.equal(releaseLock({ cwd, issue: 3 }).released, true);
  assert.equal(releaseLock({ cwd, issue: 3 }).released, false);
});

test("bad input is rejected with exit code 2", async (t) => {
  const { workdirs } = createRemote(t);
  assert.equal((await run(workdirs[0], ["claim", "0"])).status, 2);
  assert.equal((await run(workdirs[0], ["claim", "abc"])).status, 2);
  assert.equal((await run(workdirs[0], ["steal", "3"])).status, 2);
});

// A remote that accepts new refs but refuses to delete them, like the proxy in
// a cloud sandbox.
function refuseDeletes(origin) {
  const hook = join(origin, "hooks", "pre-receive");
  writeFileSync(
    hook,
    '#!/bin/sh\nwhile read old new ref; do\n  if [ "$new" = "0000000000000000000000000000000000000000" ]; then exit 1; fi\ndone\n',
    { mode: 0o755 }
  );
}

test("a remote that refuses deletes is reported as refused, not as an absent lock", (t) => {
  const { origin, workdirs } = createRemote(t);
  const cwd = workdirs[0];
  claimLock({ claimant: "cloud", cwd, issue: 8 });
  refuseDeletes(origin);
  const result = releaseLock({ cwd, issue: 8 });
  assert.equal(result.released, false);
  assert.equal(result.reason, "refused");
  assert.equal(releaseLock({ cwd, issue: 99 }).reason, "absent");
});

test("the release command tells a maintainer how to clear a refused lock", async (t) => {
  const { origin, workdirs } = createRemote(t);
  claimLock({ claimant: "cloud", cwd: workdirs[0], issue: 8 });
  refuseDeletes(origin);
  const result = await run(workdirs[0], ["release", "8"]);
  assert.equal(result.status, 0);
  assert.match(result.stdout, REFUSED);
});

test("sweep deletes the locks of closed issues and keeps open ones", (t) => {
  const { origin, workdirs } = createRemote(t);
  const cwd = workdirs[0];
  for (const issue of [11, 12, 13]) claimLock({ claimant: "a", cwd, issue });
  assert.deepEqual(listLocks({ cwd }).sort(), [11, 12, 13]);

  const closed = new Set([11, 13]);
  const preview = sweepLocks({
    cwd,
    dryRun: true,
    isClosed: (issue) => closed.has(issue),
  });
  assert.deepEqual(preview.swept.sort(), [11, 13]);
  assert.equal(listLocks({ cwd }).length, 3);

  const result = sweepLocks({ cwd, isClosed: (issue) => closed.has(issue) });
  assert.deepEqual(result.swept.sort(), [11, 13]);
  assert.deepEqual(result.kept, [12]);
  assert.deepEqual(result.failed, []);
  assert.deepEqual(remoteLocks(origin).split("\n"), [
    "refs/heads/agent-lock/12",
  ]);
});

test("sweep reports locks it could not delete", (t) => {
  const { origin, workdirs } = createRemote(t);
  const cwd = workdirs[0];
  claimLock({ claimant: "a", cwd, issue: 21 });
  refuseDeletes(origin);
  const result = sweepLocks({ cwd, isClosed: () => true });
  assert.deepEqual(result.failed, [21]);
  assert.deepEqual(result.swept, []);
});
