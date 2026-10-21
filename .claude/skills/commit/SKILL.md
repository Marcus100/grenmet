---
name: commit
description: "Reviews, validates and commits authorized changes, opens the task branch's PR into dev for the owner to merge, then arms the staging promotion. Use when a task is ready to land, when the user says commit, ship or push it, or when a routine reaches its commit gates."
allowed-tools: Bash(git *), Bash(pnpm *), Bash(gh *)
---

## Context

Claude Code fills these in; in Codex, run the commands.

- Current git status: !`git status`
- Current diff (staged and unstaged): !`git diff HEAD`
- Recent commits (for style reference): !`git log --oneline -5`

## Your task

1. Analyse the diff and write a conventional commit message:
   - Format: `type(scope): description` — types: feat, fix, chore, refactor, style, docs, test, ci
   - Keep the subject line under 72 characters
   - Add a body if the change is non-obvious (what changed and why, not how)
   - If multiple logical changes exist, note that and suggest splitting

2. Run `pnpm verify:changed` (`--dry-run` lists the checks it picks for this
   diff), plus any check from `AGENTS.md` it does not cover. Review the final
   diff and resolve failures before committing. Then run
   `node scripts/guardrails/risk-tier.mjs --base origin/dev`: for `standard` or
   `high` risk, run `/code-review` first (Codex: `/review`; a fresh-context reviewer) unless it
   already ran on this diff, and fix or answer each finding. If a gate fails twice
   on the same error, stop and report it (failure budget in `AGENTS.md`).
   For web UI changes in `gms` or `gaa-admin` it also runs `pnpm e2e` (a SKIP
   means no dev server is running; say so in the recap).

3. Stage only authorized changes, preserving unrelated staged and unstaged work.
   Commit with the reviewed message. Do not bypass hooks or force-push.

4. Integrate current `origin/dev` into the task branch, validate the combined
   result with the checks above, then push the task branch and open a PR into
   `dev` (`gh pr create --base dev`) with the step 7 recap as its body. Once CI is
   green on the PR head and the review has no open blocking finding, merge the
   PR into `dev` yourself so `origin/dev` always has the latest; never push `dev`.
   First run `gh pr checks <num> --watch --fail-fast` until it exits 0 on that
   head and post the fresh-context review as a PR comment naming the reviewer;
   then `gh pr merge <num> --merge --match-head-commit <sha>`. A `risk:high` PR
   also needs a `security-reviewer` pass with no open finding first. A PR that
   changes hooks, settings, `.codex`, `.agents`, skills, any `AGENTS.md`, guardrail
   scripts, workflows or rulesets is left for the owner to merge: the hook
   refuses it. If
   remote dev advances, integrate and revalidate before updating the PR; never
   force-push. Unattended scheduled runs (`docs/agents/routines.md`) do the same
   from their `agent/<n>-<slug>` branch. For a cross-tool review first, hand the
   owner the block from `pnpm agents:handoff`.

5. Use PRs for `dev → staging → main` promotion, reusing an existing promotion PR.
   Once the PR is merged into `dev`, create or update the staging PR following
   `/release`; the owner reviews and merges into `staging` (agents do not arm
   auto-merge). Creating the PR has standing authorization. Main merges and production publication or
   deployment still require separate authorization.

6. Run the `file-friction` skill for anything you worked around during this task.

7. End with a recap for the user (and the staging PR body when you promote):
   - **Changed:** one line per commit.
   - **Gates:** each check run and its result.
   - **Outcome:** `success`, `flawed` (shipped but needed rework or left known gaps),
     `blocked` (missing credential, service or decision) or `manual` (deliberately
     left for a human), with the reason.
   - **Friction:** issue numbers filed or commented, or `none`.

8. When the work was an agent task, post a run record with
   `node scripts/agents/run-record.mjs --kind run ... --post <issue>`; see
   `docs/agents/run-records.md`.
