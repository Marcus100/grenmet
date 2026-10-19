// Shared by the hooks that write to, or read from, the main checkout
// (SESSION_LOG.md, the Bash audit log) whichever worktree they run in.
// Reads .git directly instead of spawning `git rev-parse`, because the audit
// hook runs before every Bash command.

import { readFileSync, statSync } from "node:fs";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const GITDIR_LINE = /^gitdir:\s*(.+)$/m;
const WORKTREES_SEGMENT = `${sep}worktrees${sep}`;

/** The checkout these hook files live in. */
export const hookCheckoutRoot = resolve(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  ".."
);

/**
 * The main checkout for `checkoutRoot`: itself when `.git` is a directory,
 * otherwise the repository that owns the worktree named in its `.git` file.
 * Falls back to `checkoutRoot` when neither can be read.
 */
export function mainCheckoutRoot(checkoutRoot = hookCheckoutRoot) {
  const dotGit = join(checkoutRoot, ".git");
  try {
    if (statSync(dotGit).isDirectory()) return checkoutRoot;
    const gitdir = GITDIR_LINE.exec(readFileSync(dotGit, "utf8"))?.[1]?.trim();
    if (!gitdir) return checkoutRoot;
    const absolute = resolve(checkoutRoot, gitdir);
    const worktrees = absolute.lastIndexOf(WORKTREES_SEGMENT);
    return worktrees === -1
      ? checkoutRoot
      : dirname(absolute.slice(0, worktrees));
  } catch {
    return checkoutRoot;
  }
}
