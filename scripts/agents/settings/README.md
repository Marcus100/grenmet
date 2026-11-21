# Agent settings for a machine

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-11-21

The repository's own hooks and deny list (`.claude/settings.json`,
`.codex/config.toml`) travel with every checkout. Three things live in the
user's home folder instead, so a new machine needs them installed once:

| File here | Installed to | What it does |
| --- | --- | --- |
| `default.rules` | `~/.codex/rules/default.rules` | Codex command rules: everyday commands run freely, the edges ask the owner, destructive commands are forbidden |
| `require-heavy.mjs` | `~/.codex/hooks/require-heavy.mjs` | Codex hook that refuses a bare heavy command (tests, builds, installs, commits, pushes) and prints the `~/.local/bin/heavy` form to run instead |
| `apply.py` | (runs in place) | Installs both, adds the matching Claude Code user settings and Codex sandbox settings |

## Set up a machine

From the owner's main checkout, never a task worktree (the script refuses to
run from one unless given `--from-worktree`, which is only for testing it):

```bash
uv run scripts/agents/settings/apply.py --dry-run   # list what would change
uv run scripts/agents/settings/apply.py             # apply
```

Then restart Claude Code and Codex, and in Codex run `/hooks` and trust the new
hook. Codex runs a hook only after you trust it, and trust is tied to the
hook's hash: the project hooks in `.codex/config.toml` (the shared
`block-dangerous-git.mjs`, `protect-files.mjs` and the others) need the same
`/hooks` approval in each checkout and again after any of them changes. Until
then they do not run.

The script finds the repository from its own location and everything else from
the home folder, so it holds no machine-specific path. It is safe to run again:
it adds only what is missing and rewrites a file only when its content would
change. It checks the new content (JSON or TOML) before writing, and writes
through a temporary file renamed into place, so a failure never leaves a
half-written file. Before it changes a file it copies the old one to
`~/.local/state/grenmet-agent-settings/backups/<time>/`; restore one with
`cp <backup file> <original path>`.

These files, the hooks and `.claude/settings.json` are enforcement files: an
agent session cannot edit them (`protect-files.mjs`) and the merge hook refuses
an agent merge of a PR that changes them. The owner edits and merges them.

## Keeping Claude Code and Codex in step

`scripts/guardrails/agent-settings-parity.test.mjs` fails when the deny list in
`.claude/settings.json` and `default.rules` disagree about a dangerous command:
force push, `git reset --hard`, `git clean -f`, a push to `dev`, `staging` or
`main`, a tag push, a remote branch delete or `gh repo delete`. Change both
files together.

Codex rules match a command by its first words, so they cannot express every
form: a flag in the middle (`gh pr merge 5 --admin`, `gh pr edit 5 --base main`)
or a leading `+` (`git push origin +main`) is left to the hook. The shared hook `.claude/hooks/block-dangerous-git.mjs` runs in both tools
and refuses the rest (for example `git push origin feat/x:dev`). These rules are
a second layer, and GitHub's branch rulesets are the backstop.

`{{HOME}}` in `default.rules` stands for the home folder; `apply.py` fills it in.
