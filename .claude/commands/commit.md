---
description: Review, validate and commit authorized changes; integrate into local dev, validate, then push dev
allowed-tools: Bash(git *), Bash(pnpm *), Bash(gh *)
---

## Context

- Current git status: !`git status`
- Current diff (staged and unstaged): !`git diff HEAD`
- Recent commits (for style reference): !`git log --oneline -5`

## Your task

1. Analyse the diff and write a conventional commit message:
   - Format: `type(scope): description` — types: feat, fix, chore, refactor, style, docs, test, ci
   - Keep the subject line under 72 characters
   - Add a body if the change is non-obvious (what changed and why, not how)
   - If multiple logical changes exist, note that and suggest splitting

2. Run the required formatting, type, affected test and blast-radius checks from
   `AGENTS.md`. Review the final diff and resolve failures before committing.

3. Stage only authorized changes, preserving unrelated staged and unstaged work.
   Commit with the reviewed message. Do not bypass hooks or force-push.

4. Merge completed task branches into local `dev` in a clean integration checkout,
   incorporating current `origin/dev` first. Validate the combined result with the
   checks above, then push `dev` directly. Do not push feature branches or create
   feature-to-dev PRs unless explicitly requested. If remote dev advances,
   integrate and revalidate locally before retrying; never force-push.

5. Use PRs for `dev → staging → main` promotion, reusing an existing promotion PR.
   CI still verifies pushed changes. PR merges and deployments require explicit
   user authorization; existing session authorization counts.
