---
description: Drive the release promotion pipeline (dev→staging→main→release) with CI gating — pauses for the human at every merge and at release publish
allowed-tools: Bash(pnpm *), Bash(turbo run *), Bash(gh *), Bash(git *), Bash(curl *)
---

## Release Promotion

Follow `docs/operations/release-runbook.md` exactly. You drive verification,
PR creation, and CI watching; **the user merges every PR and publishes the
release** — never merge, push, or deploy yourself.

**1. Pre-flight**
Run `pnpm fix` and `pnpm type-check`; then run the `/pre-merge` checklist.
Report findings. Stop and ask if anything is red.

**2. dev → staging**
Create the promotion PR (`gh pr create --base staging --head dev`). Watch checks
with `gh pr checks <num> --watch` (fall back to polling `gh pr checks` every ~60s
if watch is flaky). When green, tell the user the PR is ready to merge and stop.
After they merge, confirm the staging pipeline run succeeded
(`gh run list --workflow=pipeline-staging.yml --limit 1`, then
`gh run watch <id>` if in progress).

**3. staging → main**
Same pattern with `--base main --head staging`. Remind the user: merging to main
builds nothing extra and does not deploy prod.

**4. Release**
Determine the next `vN.M` tag from `gh release list --limit 3`. Draft release
notes from the PRs/commits promoted. Show the exact
`gh release create vN.M --target main --title "vN.M" --notes "…"` command and
stop — the user publishes. After publish, watch `pipeline-prod.yml`; note that
a queued deploy job usually means the self-hosted production runner is offline.

**5. Verify**
`curl -fsS https://api.barrels.gd/api/v1/utils/health-check/` and report status.
List the four app domains for the user to spot-check.

**Output style:** one short status line per gate as you pass it. At each human
gate, say exactly what to click/run and nothing else.
