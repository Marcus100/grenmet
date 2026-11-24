// Files a push or pull request changed, shared by the check selectors.

import { execFileSync } from "node:child_process";

const zeroSha = /^0+$/u;

export function changedPaths(
  event,
  git = (args) =>
    execFileSync("git", args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
) {
  let base = event.before;
  const head = event.pull_request?.head?.sha ?? event.after;
  if (event.pull_request)
    base = git(["merge-base", event.pull_request.base.sha, head]).trim();
  if (!(base && head) || zeroSha.test(base))
    throw new Error("No trustworthy comparison base");
  return git(["diff", "--no-renames", "--name-only", "-z", base, head])
    .split("\0")
    .filter(Boolean);
}
