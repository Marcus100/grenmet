import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  formatDigests,
  imageRepositories,
  parseDigests,
  plan,
  promote,
  requiredChecks,
  sourceCommit,
} from "./promote-images.mjs";
import { webImages } from "./release-scope.mjs";

const TREE = "1".repeat(40);
const PREVIOUS_TREE = "2".repeat(40);
const DEV = "d".repeat(40);
const STAGING = "5".repeat(40);
const BEFORE = "b".repeat(40);
const digest = (n) => `sha256:${String(n).repeat(64).slice(0, 64)}`;
const RULESETS = JSON.parse(
  readFileSync(new URL("../../infra/github/rulesets.json", import.meta.url))
);
const CHECKS = requiredChecks(RULESETS);
const NO_DEV_COMMIT = /No dev commit has tree/;
const FAILED_CHECKS = /has no passing run of: Type Check/;
const DEV_MISSING = /Dev images missing for tree/;
const NOT_VERIFIED = /Staging has not deployed and accepted tree/;
const RETAG_MISMATCH = /resolves to sha256:9+, expected/;

function fakeGit({ trees = {}, devLog = `${DEV} ${TREE}\n`, diff = "" } = {}) {
  return (args) => {
    if (args[0] === "rev-parse")
      return `${trees[args[1].replace("^{tree}", "")] ?? TREE}\n`;
    if (args[0] === "log") return devLog;
    if (args[0] === "diff") return diff;
    throw new Error(`unexpected git ${args.join(" ")}`);
  };
}

function fakeGh(conclusions = {}) {
  return () =>
    CHECKS.map((name) => `${name}\t${conclusions[name] ?? "success"}`).join(
      "\n"
    );
}

/** A registry: tag → digest; `create` records calls and applies the tags. */
function fakeDocker(tags = {}, { corrupt = false } = {}) {
  const calls = [];
  const docker = (args) => {
    calls.push(args.join(" "));
    if (args[2] === "inspect") {
      const value = tags[args[3]];
      if (!value) throw new Error("not found");
      return `${value}\n`;
    }
    if (args[2] === "create") {
      const source = args.at(-1);
      const [repo, sourceDigest] = source.split("@");
      for (let i = 3; i < args.length - 1; i += 2)
        tags[args[i + 1]] = corrupt ? `sha256:${"9".repeat(64)}` : sourceDigest;
      assert.ok(repo);
      return "";
    }
    throw new Error(`unexpected docker ${args.join(" ")}`);
  };
  return { docker, calls, tags };
}

const repos = imageRepositories("Marcus100", "Marcus100/grenmet");

function allTagged(tag) {
  return Object.fromEntries(
    repos.map(({ repo }, index) => [`${repo}:${tag}`, digest(index % 9)])
  );
}

test("repositories are lower-case, API first, then every web image", () => {
  assert.equal(repos[0].repo, "ghcr.io/marcus100/grenmet");
  assert.equal(repos.length, webImages.length + 1);
  assert.ok(repos.every(({ repo }) => repo === repo.toLowerCase()));
});

test("required checks come from the dev ruleset snapshot", () => {
  assert.ok(CHECKS.includes("CI Success"));
  assert.ok(CHECKS.includes("Type Check"));
});

test("source commit is the newest dev commit with the same tree", () => {
  const git = fakeGit({
    devLog: `${"a".repeat(40)} ${"3".repeat(40)}\n${DEV} ${TREE}\n`,
  });
  assert.equal(sourceCommit(TREE, git), DEV);
  assert.throws(() => sourceCommit("4".repeat(40), git), NO_DEV_COMMIT);
});

test("staging promotes the dev digests for the tree without building", () => {
  const registry = fakeDocker(allTagged(`tree-${TREE}`));
  const result = promote({
    target: "staging",
    sha: STAGING,
    git: fakeGit(),
    gh: fakeGh(),
    docker: registry.docker,
    owner: "Marcus100",
    repository: "Marcus100/grenmet",
    rulesets: RULESETS,
  });
  assert.equal(result.source, DEV);
  assert.equal(result.digests.length, repos.length);
  for (const { repo, digest: expected } of result.digests) {
    assert.equal(registry.tags[`${repo}:staging-sha-${STAGING}`], expected);
    assert.equal(registry.tags[`${repo}:staging`], expected);
  }
  // Only registry operations: inspect and retag, never a build.
  assert.ok(
    registry.calls.every((call) => call.startsWith("buildx imagetools "))
  );
});

test("promotion refuses a dev commit whose required checks did not pass", () => {
  const registry = fakeDocker(allTagged(`tree-${TREE}`));
  assert.throws(
    () =>
      promote({
        target: "staging",
        sha: STAGING,
        git: fakeGit(),
        gh: fakeGh({ "Type Check": "failure" }),
        docker: registry.docker,
        owner: "Marcus100",
        repository: "Marcus100/grenmet",
        rulesets: RULESETS,
      }),
    FAILED_CHECKS
  );
  assert.equal(
    registry.calls.some((call) => call.includes(" create ")),
    false
  );
});

test("staging waits for the dev build, then fails when images stay missing", () => {
  const tags = allTagged(`tree-${TREE}`);
  delete tags[`${repos[3].repo}:tree-${TREE}`];
  const registry = fakeDocker(tags);
  let sleeps = 0;
  assert.throws(
    () =>
      promote({
        target: "staging",
        sha: STAGING,
        git: fakeGit(),
        gh: fakeGh(),
        docker: registry.docker,
        owner: "Marcus100",
        repository: "Marcus100/grenmet",
        rulesets: RULESETS,
        waitSeconds: 0,
        sleep: () => {
          sleeps += 1;
        },
      }),
    DEV_MISSING
  );
  assert.equal(
    registry.calls.some((call) => call.includes(" create ")),
    false
  );
  assert.equal(sleeps, 0);
});

test("production promotes only digests staging verified for the tree", () => {
  const verified = fakeDocker(allTagged(`staging-verified-tree-${TREE}`));
  const result = promote({
    target: "production",
    sha: STAGING,
    git: fakeGit(),
    gh: fakeGh(),
    docker: verified.docker,
    owner: "Marcus100",
    repository: "Marcus100/grenmet",
    rulesets: RULESETS,
  });
  for (const { repo, digest: expected } of result.digests) {
    assert.equal(verified.tags[`${repo}:production-sha-${STAGING}`], expected);
    assert.equal(verified.tags[`${repo}:latest`], undefined);
  }
  const unverified = fakeDocker(allTagged(`tree-${TREE}`));
  assert.throws(
    () =>
      promote({
        target: "production",
        sha: STAGING,
        git: fakeGit(),
        gh: fakeGh(),
        docker: unverified.docker,
        owner: "Marcus100",
        repository: "Marcus100/grenmet",
        rulesets: RULESETS,
      }),
    NOT_VERIFIED
  );
});

test("a retag that resolves to another digest fails", () => {
  const registry = fakeDocker(allTagged(`tree-${TREE}`), { corrupt: true });
  assert.throws(
    () =>
      promote({
        target: "staging",
        sha: STAGING,
        git: fakeGit(),
        gh: fakeGh(),
        docker: registry.docker,
        owner: "Marcus100",
        repository: "Marcus100/grenmet",
        rulesets: RULESETS,
      }),
    RETAG_MISMATCH
  );
});

test("dev plan builds changed images and reuses the rest by digest", () => {
  const registry = fakeDocker(allTagged(`tree-${PREVIOUS_TREE}`));
  const result = plan({
    event: { before: BEFORE, after: DEV },
    git: fakeGit({
      trees: { [BEFORE]: PREVIOUS_TREE, [DEV]: TREE },
      diff: "apps/web/docs/src/app/page.tsx\0",
    }),
    docker: registry.docker,
    owner: "Marcus100",
    repository: "Marcus100/grenmet",
  });
  assert.equal(result.tree, TREE);
  assert.equal(result.api, false);
  assert.deepEqual(
    result.web.map((image) => image.image),
    ["web-docs"]
  );
  assert.equal(result.reuse.length, repos.length - 1);
  assert.ok(result.reuse.every(({ key }) => key !== "web-docs"));
});

test("dev plan builds an image the previous tree lacks", () => {
  const tags = allTagged(`tree-${PREVIOUS_TREE}`);
  delete tags[`ghcr.io/marcus100/grenmet:tree-${PREVIOUS_TREE}`];
  const result = plan({
    event: { before: BEFORE, after: DEV },
    git: fakeGit({
      trees: { [BEFORE]: PREVIOUS_TREE, [DEV]: TREE },
      diff: "docs/readme-only.md\0",
    }),
    docker: fakeDocker(tags).docker,
    owner: "Marcus100",
    repository: "Marcus100/grenmet",
  });
  assert.equal(result.api, true);
  assert.deepEqual(result.web, []);
});

test("dev plan without a trustworthy base builds everything", () => {
  const result = plan({
    event: { before: "0".repeat(40), after: DEV },
    git: fakeGit(),
    docker: fakeDocker({}).docker,
    owner: "Marcus100",
    repository: "Marcus100/grenmet",
  });
  assert.equal(result.api, true);
  assert.equal(result.web.length, webImages.length);
  assert.deepEqual(result.reuse, []);
});

test("deploy digest lists round-trip and reject malformed entries", () => {
  const digests = [{ repo: "ghcr.io/marcus100/grenmet", digest: digest(1) }];
  assert.deepEqual(parseDigests(formatDigests(digests)), digests);
  assert.throws(() => parseDigests("ghcr.io/x:latest"));
});
