---
name: commit
description: "Reviews, validates and commits authorized changes, opens the task branch's PR into dev and merges it once CI is green and the review is clean, and sends the owner a phone alert. Use when a task is ready to land, when the user says commit, ship or push it, or when a routine reaches its commit gates."
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

2. Format and lint the files you touched and run the targeted tests of what
   changed (root `AGENTS.md` → Always); GitHub CI on the PR is the full gate.
   Run `pnpm verify:changed` only for work you are not pushing, or with `--full`
   before a risky merge. Review the final diff and resolve failures before
   committing. Then run
   `node scripts/guardrails/risk-tier.mjs --base origin/dev`: for `standard` or
   `high` risk, run `/code-review` first (Codex: `/review`; a fresh-context reviewer) unless it
   already ran on this diff, and fix or answer each finding. If a gate fails twice
   on the same error, stop and report it (failure budget in `AGENTS.md`).
   For web UI changes in `gms` or `gaa-admin`, also run `pnpm e2e` (a SKIP
   means no dev server is running; say so in the recap). Tests, builds,
   commits and pushes are heavy commands: on the shared machine they run through
   `~/.local/bin/heavy`, one at a time (the hooks enforce it;
   `docs/agents/tool-usage.md` → Heavy commands).

3. Stage only authorized changes, preserving unrelated staged and unstaged work.
   Commit with the reviewed message. Do not bypass hooks or force-push.

4. Integrate current `origin/dev` into the task branch, validate the combined
   result with the checks above, then push the task branch; never push to `dev`,
   and never force-push. If remote dev advances, integrate and revalidate before
   updating the PR. Unattended scheduled runs (`docs/agents/routines.md`) do the
   same from their `agent/<n>-<slug>` branch. Then, one command per call, with
   long text written to a file first (no heredocs, no long inline `--body`):
   1. Write the step 7 recap to a file and open the PR into `dev`:
      `gh pr create --base dev --title "<title>" --body-file <file>`.
   2. Wait for CI: `gh pr checks <num> --watch --fail-fast` until it exits 0 on
      the PR head.
   3. Get the fresh-context review of that head, write it to a file and post it,
      naming the reviewer: `gh pr comment <num> --body-file <file>`. Fix or
      answer each finding. A `risk:high` PR also needs a clean
      `security-reviewer` pass, named in the PR body. For a cross-tool review,
      post the block from `pnpm agents:handoff` as a PR comment the same way.
   4. Both owner-merge groups stop after CI and review; the hook refuses an
      agent merge of either. Enforcement files (hooks, `.claude/settings.json`,
      `.codex`, Codex rules, `.github`, rulesets, `.husky`, root `package.json`,
      guardrail scripts that are not tests): stop there. Agent-rules files
      (skills, role briefs, `docs/agents`, guardrail tests, the root
      `AGENTS.md`): also run the `security-reviewer` on the head and, once it is
      clean, add this line to the PR body (`gh pr edit <num> --body-file <file>`)
      alone on its line with the full 40-character head sha:
      `Security review: no open findings (<reviewer>, <sha>)`. A new push means
      a new review and a new line. Then stop and leave the merge to the owner,
      who is the second reviewer (`docs/agents/workflow.md` → Merging into dev).
   5. Otherwise, once CI is green on the head and the review has no open
      blocking finding, merge it yourself, alone in its command:
      `gh pr merge <num> --repo Marcus100/grenmet --merge --match-head-commit <full head sha>`.
   6. Send the owner a phone alert: the PR number, title and link. For a
      agent-rules PR send a separate alert that lists the files changed.
      Use `PushNotification` when the session has it; otherwise comment on the
      open issue labelled `factory-landed`.

   In a cloud session `gh pr` is blocked: use the `gh api` forms in
   `docs/agents/tool-usage.md` → GitHub from a cloud session (create the PR,
   list the check runs, comment, and merge with
   `gh api -X PUT repos/Marcus100/grenmet/pulls/<num>/merge -f sha=<full head sha> -f merge_method=merge`).
   Full rule: `docs/agents/workflow.md` → Merging into dev.

5. Use PRs for `dev → staging → main` promotion, reusing an existing promotion PR.
   Once the PR is merged into `dev`, stop: say what is now waiting on `dev`. Open
   or update the staging PR (following `/release`) only when the owner asks for
   it; the owner reviews and merges into `staging` (agents do not arm auto-merge).
   Main merges and production publication or deployment still require separate
   authorization.

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
