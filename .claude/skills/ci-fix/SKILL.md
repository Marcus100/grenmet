# Diagnose Failing CI
1. Run `gh pr checks` on the current PR
2. For each failing check, fetch logs with `gh run view --log-failed`
3. Identify root cause before proposing fixes
4. Show the fix and WAIT for approval before editing
5. After fix, verify locally with the same command CI runs
