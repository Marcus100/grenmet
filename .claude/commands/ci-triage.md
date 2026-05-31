---
description: Diagnose failing CI checks — enumerate hypotheses, falsify cheapest first, show fix and wait for approval
allowed-tools: Bash(gh pr *), Bash(gh run *)
---

## CI Triage

**Step 1 — List failures**
Run `gh pr checks` on the current PR and list every failing check by name.

**Step 2 — Hypotheses first, before any investigation**
For each failing check, enumerate your top 3 hypotheses with the single fastest command to falsify each. Present this list to the user. Do not start running commands or reading files yet.

**Step 3 — Wait for approval to investigate**
After the user approves the hypothesis list, test each one from cheapest to most expensive. Stop and report findings after each hypothesis before moving to the next.

**Step 4 — Confirm root cause**
State the confirmed root cause clearly. Do not guess or propose a fix until you have evidence.

**Step 5 — Show the fix, wait for go**
Show the exact file changes (as a diff) and any commands needed to apply the fix. Do not edit files until the user says "go" or approves.

**Step 6 — Verification command**
After the fix is applied, show the exact command the user can run locally to confirm it resolves the failure before pushing.

---

Current PR info:
- Branch: !`git branch --show-current`
- Recent commits: !`git log --oneline -5`
