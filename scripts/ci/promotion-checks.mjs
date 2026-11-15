// Dev-commit lookup and required-check verification shared by
// promote-images.mjs and promotion-verified.mjs (kept apart so the two do not
// import each other through select-images.mjs).

const TREE = /^[0-9a-f]{40}$/u;
const DEV_HISTORY_DEPTH = "2000";

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
