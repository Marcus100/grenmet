---
description: Generate a conventional commit message from the current diff — shows the message and command, does not run git commit
allowed-tools: Bash(git status:*), Bash(git diff:*)
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

2. Output the message as a code block so it's easy to copy.

3. Show the exact commands to stage and commit — do NOT run them:
   ```
   git add -A
   git commit -m "your message here"
   ```

Stop here. Do not run git, do not push.
