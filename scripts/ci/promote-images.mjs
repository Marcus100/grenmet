// Build once, promote by digest (issue #1019).
//
// Images are built when a change lands on dev and tagged `tree-<git tree>`.
// Staging and main are merge commits of dev, so a commit there has the same git
// tree as the dev commit it came from; promotion finds the images by tree,
// checks that the dev commit passed the required checks, and retags the exact
// digests. Production promotes only digests that staging deployed and accepted
// (`staging-verified-tree-<tree>`).
//
//   promote-images.mjs plan              dev: which images to build, which to reuse
//   promote-images.mjs reuse             dev: retag unchanged images to this tree
//   promote-images.mjs promote <target>  staging | production: verify and retag
//   promote-images.mjs verified          staging: record the deployed digests
//   promote-images.mjs publish-release   production: move latest and the release tag
import { execFileSync } from "node:child_process";
import { appendFileSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { webImages } from "./release-scope.mjs";
import { changedPaths, selectImages } from "./select-images.mjs";

const TREE = /^[0-9a-f]{40}$/;
const COMMIT = /^[0-9a-f]{40}$/;
const DIGEST = /^sha256:[0-9a-f]{64}$/;
const DEV_HISTORY_DEPTH = "2000";
const WHITESPACE = /\s+/;

/** Every release image repository: the API first, then the web images. */
export function imageRepositories(owner, repository) {
  return [
    { key: "api", repo: `ghcr.io/${repository.toLowerCase()}` },
    ...webImages.map((image) => ({
      key: image.image,
      repo: `ghcr.io/${owner.toLowerCase()}/barrelsgd-${image.image}`,
    })),
  ];
}

export function treeOf(sha, git) {
  const tree = git(["rev-parse", `${sha}^{tree}`]).trim();
  if (!TREE.test(tree)) throw new Error(`No git tree for ${sha}`);
  return tree;
}

/** The newest dev commit with this exact tree; promotion never builds. */
export function sourceCommit(tree, git, devRef = "origin/dev") {
  const log = git(["log", "--format=%H %T", "-n", DEV_HISTORY_DEPTH, devRef]);
  for (const line of log.split("\n")) {
    const [commit, commitTree] = line.trim().split(" ");
    if (commitTree === tree) return commit;
  }
  throw new Error(
    `No dev commit has tree ${tree}. Promote only what landed on dev (merge dev into this branch), or use the manual rebuild in docs/operations/release-runbook.md.`
  );
}

/**
 * Required status checks of the dev ruleset, with the GitHub App that must
 * report each (the ruleset's integration_id), so a check-run of the same name
 * from another app cannot satisfy the gate.
 */
export function requiredChecks(rulesets) {
  const list = Array.isArray(rulesets) ? rulesets : rulesets.rulesets;
  const dev = list.find((ruleset) =>
    ruleset.conditions?.ref_name?.include?.includes("refs/heads/dev")
  );
  const rule = dev?.rules.find(
    (candidate) => candidate.type === "required_status_checks"
  );
  const checks = rule?.parameters.required_status_checks.map((check) => ({
    name: check.context,
    appId: check.integration_id ?? null,
  }));
  if (!checks?.length) throw new Error("No required checks found for dev");
  return checks;
}

function describeProblem({ name, appId, mine, commit }) {
  if (mine.length === 0) return `${name} (no run by app ${appId ?? "any"})`;
  const states = [...new Set(mine.map(([, conclusion]) => conclusion))];
  if (states.includes("cancelled"))
    return `${name} (cancelled, probably superseded by a later dev push: re-run it on ${commit})`;
  return `${name} (${states.join(", ")})`;
}

/** Fails closed unless every required check has a successful run by its app. */
export function verifyChecks(commit, checks, gh, repository) {
  const runs = gh([
    "api",
    "--paginate",
    `repos/${repository}/commits/${commit}/check-runs?per_page=100`,
    "--jq",
    ".check_runs[] | [.name, (.conclusion // .status), (.app.id | tostring)] | @tsv",
  ])
    .split("\n")
    .filter(Boolean)
    .map((line) => line.split("\t"));
  const problems = [];
  for (const { name, appId } of checks) {
    const mine = runs.filter(
      ([runName, , runApp]) =>
        runName === name && (appId === null || runApp === String(appId))
    );
    if (mine.some(([, conclusion]) => conclusion === "success")) continue;
    problems.push(describeProblem({ name, appId, mine, commit }));
  }
  if (problems.length)
    throw new Error(
      `Dev commit ${commit} has no passing run of: ${problems.join("; ")}`
    );
}

/** Image config labels of a digest; fails closed when they cannot be read. */
export function labelsOf(repo, digest, docker) {
  let config;
  try {
    const parsed = JSON.parse(
      docker([
        "buildx",
        "imagetools",
        "inspect",
        `${repo}@${digest}`,
        "--format",
        "{{json .Image}}",
      ])
    );
    config = parsed.config ?? parsed["linux/amd64"]?.config;
  } catch {
    config = null;
  }
  if (!config)
    throw new Error(`Cannot read the image labels of ${repo}@${digest}`);
  return config.Labels ?? {};
}

/**
 * Checks where an image really came from. A reused image keeps the labels of
 * the commit that built it, which may be an older dev commit, so equality with
 * the promoted commit is wrong. Instead the labelled commit must (a) be the
 * promoted source or an ancestor of it on dev, (b) have exactly the labelled
 * tree, and (c) have passed the required checks itself. `ctx.passed` caches
 * checks per commit.
 */
export function verifyLabels(repo, digest, ctx, docker) {
  const { git, gh, repository, checks, source, passed } = ctx;
  const labels = labelsOf(repo, digest, docker);
  const commit = labels["org.opencontainers.image.revision"];
  const labelTree = labels["gd.barrels.tree"];
  const where = `${repo}@${digest} was built from`;
  if (!(COMMIT.test(commit ?? "") && TREE.test(labelTree ?? "")))
    throw new Error(`${where} an unknown commit or tree (labels missing)`);
  try {
    git(["merge-base", "--is-ancestor", commit, source]);
  } catch {
    throw new Error(
      `${where} commit ${commit}, which is not the promoted dev commit ${source} or one of its ancestors`
    );
  }
  if (treeOf(commit, git) !== labelTree)
    throw new Error(
      `${where} tree ${labelTree}, but commit ${commit} has a different tree`
    );
  if (!passed.has(commit)) {
    verifyChecks(commit, checks, gh, repository);
    passed.add(commit);
  }
}

export function digestOf(reference, docker) {
  let digest;
  try {
    digest = docker([
      "buildx",
      "imagetools",
      "inspect",
      reference,
      "--format",
      "{{.Manifest.Digest}}",
    ]).trim();
  } catch {
    return null;
  }
  return DIGEST.test(digest) ? digest : null;
}

/** Adds tags to an existing digest, then checks they resolve to it. */
export function retag(repo, digest, tags, docker) {
  docker([
    "buildx",
    "imagetools",
    "create",
    ...tags.flatMap((tag) => ["--tag", `${repo}:${tag}`]),
    `${repo}@${digest}`,
  ]);
  for (const tag of tags) {
    const actual = digestOf(`${repo}:${tag}`, docker);
    if (actual !== digest)
      throw new Error(
        `${repo}:${tag} resolves to ${actual ?? "nothing"}, expected ${digest}`
      );
  }
}

/** dev: images the change touches, or that the previous tree lacks, get built. */
export function plan({ event, git, docker, owner, repository }) {
  const tree = treeOf(event.after, git);
  let selection;
  let previousTree = null;
  try {
    selection = selectImages(changedPaths(event, git), "affected");
    previousTree = treeOf(event.before, git);
  } catch {
    selection = selectImages([], "full");
  }
  const repos = imageRepositories(owner, repository);
  // Already built for this tree (a re-run, or a dispatch for a finished
  // commit): nothing to do for those images.
  const present = new Set(
    repos
      .filter(({ repo }) => digestOf(`${repo}:tree-${tree}`, docker))
      .map(({ key }) => key)
  );
  const build = new Set([
    ...(selection.api ? ["api"] : []),
    ...selection.web.map((image) => image.image),
  ]);
  const reuse = [];
  for (const { key, repo } of repos) {
    if (present.has(key)) {
      build.delete(key);
      continue;
    }
    if (build.has(key)) continue;
    const digest =
      previousTree && digestOf(`${repo}:tree-${previousTree}`, docker);
    if (digest) reuse.push({ key, repo, digest });
    else build.add(key);
  }
  return {
    tree,
    api: build.has("api"),
    web: webImages.filter((image) => build.has(image.image)),
    reuse,
  };
}

/** staging | production: verified digests for this commit's tree, retagged. */
export function promote({
  target,
  sha,
  git,
  gh,
  docker,
  owner,
  repository,
  rulesetsAt,
  waitSeconds = 0,
  sleep = () => undefined,
  now = () => Date.now(),
}) {
  if (target !== "staging" && target !== "production")
    throw new Error("Target must be staging or production");
  const tree = treeOf(sha, git);
  const source = sourceCommit(tree, git);
  // The gate comes from the dev commit being promoted, not from the ref that
  // triggered the promotion.
  const checks = requiredChecks(rulesetsAt(source));
  verifyChecks(source, checks, gh, repository);
  const passed = new Set([source]);
  const sourceTag =
    target === "staging" ? `tree-${tree}` : `staging-verified-tree-${tree}`;
  const tags =
    target === "staging"
      ? [`staging-sha-${sha}`, "staging"]
      : [`production-sha-${sha}`];
  const resolve = () => {
    const found = [];
    const absent = [];
    for (const { repo } of imageRepositories(owner, repository)) {
      const digest = digestOf(`${repo}:${sourceTag}`, docker);
      if (digest) found.push({ repo, digest });
      else absent.push(`${repo}:${sourceTag}`);
    }
    return { found, absent };
  };
  let { found: digests, absent: missing } = resolve();
  if (missing.length && target === "staging") {
    // The dev build for this commit never ran or was dropped: start it, wait.
    const running = gh([
      "run",
      "list",
      "--workflow",
      "dev-images.yml",
      "--json",
      "headSha,status,displayTitle",
      "--jq",
      // A push run has the commit as headSha; a dispatched run carries it in
      // its run-name (dev-images.yml), as its own headSha is the dev head.
      `[.[] | select((.headSha == "${source}" or (.displayTitle | contains("${source}"))) and .status != "completed")] | length`,
    ]).trim();
    if (running === "0") {
      console.log(
        `No dev image build is running for ${source}; dispatching one.`
      );
      gh([
        "workflow",
        "run",
        "dev-images.yml",
        "--ref",
        "dev",
        "-f",
        `sha=${source}`,
      ]);
    }
    const deadline = now() + waitSeconds * 1000;
    while (missing.length && now() < deadline) {
      console.log(
        `Waiting for ${missing.length} dev image(s) of tree ${tree}...`
      );
      sleep();
      ({ found: digests, absent: missing } = resolve());
    }
  }
  if (missing.length)
    throw new Error(
      target === "staging"
        ? `Dev images missing for tree ${tree} after waiting (dev commit ${source}); check the Dev Images runs: ${missing.join(", ")}`
        : `Staging has not deployed and accepted tree ${tree}: ${missing.join(", ")}`
    );
  for (const { repo, digest } of digests)
    verifyLabels(
      repo,
      digest,
      { git, gh, repository, checks, source, passed },
      docker
    );
  for (const { repo, digest } of digests) retag(repo, digest, tags, docker);
  return { tree, source, digests };
}

/** Parses `repo@sha256:…` lines, the deploy manifest format. */
export function parseDigests(text) {
  return text
    .split(WHITESPACE)
    .filter(Boolean)
    .map((entry) => {
      const at = entry.lastIndexOf("@");
      const repo = entry.slice(0, at);
      const digest = entry.slice(at + 1);
      if (at < 1 || !DIGEST.test(digest))
        throw new Error(`Bad image digest entry: ${entry}`);
      return { repo, digest };
    });
}

export function formatDigests(digests) {
  return digests.map(({ repo, digest }) => `${repo}@${digest}`).join(" ");
}

function run(command) {
  return (args) =>
    execFileSync(command, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
    });
}

function output(values) {
  const lines = Object.entries(values)
    .map(([key, value]) => `${key}=${value}\n`)
    .join("");
  if (process.env.GITHUB_OUTPUT)
    appendFileSync(process.env.GITHUB_OUTPUT, lines);
  process.stdout.write(lines);
}

function summary(text) {
  if (process.env.GITHUB_STEP_SUMMARY)
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${text}\n`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, target] = process.argv.slice(2);
  const env = process.env;
  const context = {
    git: run("git"),
    gh: run("gh"),
    docker: run("docker"),
    owner: env.GITHUB_REPOSITORY_OWNER,
    repository: env.GITHUB_REPOSITORY,
  };
  try {
    if (command === "plan") {
      const event = JSON.parse(readFileSync(env.GITHUB_EVENT_PATH, "utf8"));
      // A manual dispatch builds the commit named in DEV_SHA (or the ref's own).
      if (!event.after) event.after = env.DEV_SHA || env.GITHUB_SHA;
      if (!event.before)
        event.before = context.git(["rev-parse", `${event.after}^`]).trim();
      const result = plan({ ...context, event });
      output({
        sha: event.after,
        tree: result.tree,
        api: String(result.api),
        web: JSON.stringify(result.web),
        reuse: formatDigests(result.reuse),
      });
      summary(
        `Dev images for tree ${result.tree}: build ${[result.api ? "api" : "", ...result.web.map((image) => image.image)].filter(Boolean).join(", ") || "none"}; reuse ${result.reuse.map((entry) => entry.key).join(", ") || "none"}.`
      );
    } else if (command === "reuse") {
      for (const { repo, digest } of parseDigests(env.REUSE_DIGESTS ?? ""))
        retag(repo, digest, [`tree-${env.TREE}`], context.docker);
    } else if (command === "promote") {
      const result = promote({
        ...context,
        target,
        sha: env.GITHUB_SHA,
        rulesetsAt: (commit) =>
          JSON.parse(
            context.git(["show", `${commit}:infra/github/rulesets.json`])
          ),
        // Staging waits for the dev build (dispatching it if it never ran);
        // production never waits: staging must already have run.
        waitSeconds:
          target === "staging"
            ? Number(
                env.PROMOTE_WAIT_SECONDS ?? 2700
              ) /* 45 min for a dispatched dev build */
            : 0,
        sleep: () => execFileSync("sleep", ["30"]),
      });
      output({
        tree: result.tree,
        source: result.source,
        digests: formatDigests(result.digests),
      });
      summary(
        `Promoted tree ${result.tree} (dev commit ${result.source}) to ${target}:\n\n${result.digests.map(({ repo, digest }) => `- \`${repo}@${digest}\``).join("\n")}`
      );
    } else if (command === "verified") {
      if (!TREE.test(env.TREE ?? "")) throw new Error("TREE is required");
      for (const { repo, digest } of parseDigests(
        env.DEPLOY_IMAGE_DIGESTS ?? ""
      ))
        retag(
          repo,
          digest,
          [`staging-verified-tree-${env.TREE}`],
          context.docker
        );
    } else if (command === "publish-release") {
      if (!env.RELEASE_TAG) throw new Error("RELEASE_TAG is required");
      for (const { repo, digest } of parseDigests(
        env.DEPLOY_IMAGE_DIGESTS ?? ""
      ))
        retag(repo, digest, ["latest", env.RELEASE_TAG], context.docker);
    } else {
      throw new Error(
        "Usage: promote-images.mjs plan|reuse|promote <target>|verified|publish-release"
      );
    }
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exit(1);
  }
}
