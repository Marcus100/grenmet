# Branch ruleset for `dev`

**Status:** Proposed, not applied  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-21

Agents merge their own PRs into `dev` once CI is green and the review is clean
(`AGENTS.md`, `/commit` step 4). Today nothing on GitHub enforces "CI is green":
`dev` has no ruleset, so the check lives in the skill and the agent hook. This
ruleset makes GitHub enforce it, so a mistaken or injected merge cannot skip CI.
It needs no approvals, so the factory keeps a current `origin/dev`.

## What it enforces

- Changes reach `dev` only through a pull request.
- `CI Success`, `Build Web Apps`, `Biome Check`, `Type Check`, `api-client` and
  `Peer Dependencies` must pass, the same checks `staging` and `main` already require.
- No force pushes and no deleting `dev`.
- No bypass actors, and no required approvals.

## Apply it

The owner applies it (it needs repository admin rights). From the repository root:

```bash
gh api -X POST repos/Marcus100/grenmet/rulesets --input - <<'EOF'
{
  "name": "Protect dev",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["refs/heads/dev"], "exclude": [] } },
  "rules": [
    { "type": "deletion" },
    { "type": "non_fast_forward" },
    {
      "type": "pull_request",
      "parameters": {
        "allowed_merge_methods": ["merge", "squash", "rebase"],
        "dismiss_stale_reviews_on_push": false,
        "require_code_owner_review": false,
        "require_extra_approval_for_unattributed_changes": false,
        "require_last_push_approval": false,
        "required_approving_review_count": 0,
        "required_review_thread_resolution": false,
        "required_reviewers": []
      }
    },
    {
      "type": "required_status_checks",
      "parameters": {
        "do_not_enforce_on_create": false,
        "strict_required_status_checks_policy": false,
        "required_status_checks": [
          { "context": "api-client", "integration_id": 15368 },
          { "context": "Biome Check", "integration_id": 15368 },
          { "context": "Build Web Apps", "integration_id": 15368 },
          { "context": "CI Success", "integration_id": 15368 },
          { "context": "Peer Dependencies", "integration_id": 15368 },
          { "context": "Type Check", "integration_id": 15368 }
        ]
      }
    }
  ]
}
EOF
```

Then refresh the committed copy and commit it, so the drift check stays green:

```bash
node scripts/guardrails/github-rulesets.mjs --snapshot
```

Do not add it to `infra/github/rulesets.json` before applying it: the drift
check compares that file with GitHub and would fail.

## Consequences

- Direct pushes to `dev` stop working, for people and agents. Use a PR.
- A PR into `dev` cannot merge until the six checks pass, which is what the agent
  skill already waits for.
- `pull_request_target` workflows such as the AI review still run from `main`.
- The agent hook (`.claude/hooks/block-dangerous-git.mjs`) stays: the ruleset
  guards CI, the hook guards which PRs an agent may merge.
