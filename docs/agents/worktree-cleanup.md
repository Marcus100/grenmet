# Finished worktree cleanup

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-08

Preview registered Claude worktrees from a Grenmet checkout:

```bash
node scripts/agents/worktree-clean.mjs
```

After confirming with the worktree's owner that the session is finished, remove
one eligible checkout by its explicit path:

```bash
node scripts/agents/worktree-clean.mjs --remove /absolute/path/to/.claude/worktrees/agent-example
```

The command checks that the registered checkout is physically inside the main
repository's managed `<main-checkout>/.claude/worktrees/` directory (created
by the harness when needed), its current commit is already in
`origin/dev`, it is unlocked, and no running process belonging to the current
user has its working directory there. An incomplete process inspection blocks
removal. Local remote-tracking history must be current before choosing a target.

Tracked changes, untracked files, and unexpected ignored data block cleanup.
The generated directories that may be discarded are `node_modules`, `.venv`,
`.pnpm-store`, `.turbo`, `.next`, `__pycache__`, `.pytest_cache`, `.mypy_cache`,
`.ruff_cache`, and `coverage`. Preserve any unique material placed inside those
directories before removal. Environment files, private data and session logs
must be moved to an appropriate preserved location first.

The command rechecks registration and safety immediately before calling normal
Git worktree removal. It retains the branch and uses no forced removal or
automatic unlocking. A locked harness checkout needs its owner's review; a
clean Git status alone does not establish that a session has finished. Process
checks cannot detect an editor working through absolute paths from elsewhere,
so explicit confirmation of ownership remains necessary.

The default preview does not remove files, branches, locks, or registrations.

## Manual task worktrees

Manual task worktrees live outside the main checkout, under
`~/worktrees/<repo>/<task>/`. They stay out of the default scope. Select their
directory explicitly with `--root`, for both the preview and the removal:

```bash
node scripts/agents/worktree-clean.mjs --root ~/worktrees/grenmet
node scripts/agents/worktree-clean.mjs --root ~/worktrees/grenmet --remove ~/worktrees/grenmet/example-task
```

`--root` must be an absolute path to a real directory. It cannot be a symlink,
the main checkout, a directory inside it, or a directory that contains it, so it
can never widen the scope to the main checkout or its managed worktrees. Only
registered worktrees physically inside that directory are listed. Checkouts
reached through links, such as `~/worktrees/grenmet/claude-managed/`, are
skipped. Every other check still applies: merged into `origin/dev`, clean,
unlocked, no running process, and the branch is kept.

Manual checkouts often hold ignored files the helper does not recognise, such
as local notes, exports, `.env*` files or tool output. Any of these blocks
removal. Preserve each one somewhere appropriate, or confirm with the owner that
it can be discarded, and then run the preview again. Never delete it just to
make the checkout eligible.
