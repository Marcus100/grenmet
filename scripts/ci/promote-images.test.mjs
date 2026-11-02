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
const APP_ID = CHECKS[0].appId;
const rulesetsAt = () => RULESETS;
const NO_DEV_COMMIT = /No dev commit has tree/;
const FAILED_CHECKS = /has no passing run of: Type Check/;
const CANCELLED_CHECK = /Type Check \(cancelled, probably superseded/;
const WRONG_APP = /Type Check \(no run by app/;
const WRONG_LABEL = /was built from (tree|commit)/;
const UNREADABLE_LABELS = /Cannot read the image labels/;
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

/** check-runs as GitHub returns them, plus the workflow-run commands. */
function fakeGh(
  conclusions = {},
  { app = APP_ID, running = "1", dispatches } = {}
) {
  return (args) => {
    if (args[0] === "run") return `${running}\n`;
    if (args[0] === "workflow") {
      dispatches?.push(args.join(" "));
      return "";
    }
    return CHECKS.map(
      ({ name }) => `${name}\t${conclusions[name] ?? "success"}\t${app}`
    ).join("\n");
  };
}

/** A registry: tag → digest; `create` records calls and applies the tags. */
function fakeDocker(
  tags = {},
  { corrupt = false, labels, unreadable = false } = {}
) {
  const calls = [];
  const docker = (args) => {
    calls.push(args.join(" "));
    if (args[2] === "inspect" && args.includes("{{json .Image}}")) {
      if (unreadable) throw new Error("no config");
      const label = labels ?? {
        "gd.barrels.tree": TREE,
        "org.opencontainers.image.revision": DEV,
      };
      return JSON.stringify({ config: { Labels: label } });
    }
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
  const names = CHECKS.map(({ name }) => name);
  assert.ok(names.includes("CI Success"));
  assert.ok(names.includes("Type Check"));
  assert.ok(CHECKS.every(({ appId }) => Number.isInteger(appId)));
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
    rulesetsAt,
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
        rulesetsAt,
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
        rulesetsAt,
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
    rulesetsAt,
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
        rulesetsAt,
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
        rulesetsAt,
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

/** A clock that jumps an hour per read, so waits end immediately. */
function steppingClock() {
  let time = 0;
  return () => {
    time += 3_600_000;
    return time;
  };
}

function stage(overrides = {}) {
  const registry = overrides.registry ?? fakeDocker(allTagged(`tree-${TREE}`));
  return {
    registry,
    run: () =>
      promote({
        target: "staging",
        sha: STAGING,
        git: fakeGit(),
        gh: overrides.gh ?? fakeGh(),
        docker: registry.docker,
        owner: "Marcus100",
        repository: "Marcus100/grenmet",
        rulesetsAt: overrides.rulesetsAt ?? rulesetsAt,
        ...overrides.extra,
      }),
  };
}

test("a cancelled required check blocks promotion with a clear message", () => {
  const { run } = stage({ gh: fakeGh({ "Type Check": "cancelled" }) });
  assert.throws(run, CANCELLED_CHECK);
});

test("a check-run reported by another app does not satisfy the gate", () => {
  const { run } = stage({ gh: fakeGh({}, { app: 1 }) });
  assert.throws(run, WRONG_APP);
});

test("the gate is read from the dev commit being promoted", () => {
  const asked = [];
  const { run } = stage({
    rulesetsAt: (commit) => {
      asked.push(commit);
      return RULESETS;
    },
  });
  run();
  assert.deepEqual(asked, [DEV]);
});

test("images built from another tree or commit are refused before any retag", () => {
  for (const labels of [
    {
      "gd.barrels.tree": "3".repeat(40),
      "org.opencontainers.image.revision": DEV,
    },
    {
      "gd.barrels.tree": TREE,
      "org.opencontainers.image.revision": "e".repeat(40),
    },
    {},
  ]) {
    const registry = fakeDocker(allTagged(`tree-${TREE}`), { labels });
    const { run } = stage({ registry });
    assert.throws(run, WRONG_LABEL);
    assert.equal(
      registry.calls.some((call) => call.includes(" create ")),
      false
    );
  }
  const unreadable = fakeDocker(allTagged(`tree-${TREE}`), {
    unreadable: true,
  });
  assert.throws(stage({ registry: unreadable }).run, UNREADABLE_LABELS);
});

test("missing dev images start a dev build for that commit and wait for it", () => {
  const tags = allTagged(`tree-${TREE}`);
  const held = { ...tags };
  for (const key of Object.keys(tags)) delete tags[key];
  const registry = fakeDocker(tags);
  const dispatches = [];
  let sleeps = 0;
  const { run } = stage({
    registry,
    gh: fakeGh({}, { running: "0", dispatches }),
    extra: {
      waitSeconds: 60,
      sleep: () => {
        sleeps += 1;
        if (sleeps === 2) Object.assign(tags, held);
      },
    },
  });
  const result = run();
  assert.equal(dispatches.length, 1);
  assert.ok(dispatches[0].includes(`sha=${DEV}`));
  assert.equal(result.digests.length, repos.length);
});

test("a dev build already running for the commit is awaited, not duplicated", () => {
  const dispatches = [];
  const { run } = stage({
    registry: fakeDocker({}),
    gh: fakeGh({}, { running: "1", dispatches }),
    extra: {
      waitSeconds: 0,
      now: steppingClock(),
    },
  });
  assert.throws(run, DEV_MISSING);
  assert.equal(dispatches.length, 0);
});

test("a dev plan skips images that already exist for the tree", () => {
  const registry = fakeDocker(allTagged(`tree-${TREE}`));
  const result = plan({
    event: { before: BEFORE, after: DEV },
    git: fakeGit({
      trees: { [BEFORE]: PREVIOUS_TREE, [DEV]: TREE },
      diff: "apps/web/docs/x.ts\0",
    }),
    docker: registry.docker,
    owner: "Marcus100",
    repository: "Marcus100/grenmet",
  });
  assert.equal(result.api, false);
  assert.deepEqual(result.web, []);
  assert.deepEqual(result.reuse, []);
});
