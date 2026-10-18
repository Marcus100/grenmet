# Engineering principles

**Status:** Active reference  
**Owner:** Barrels Grenada engineering  
**Last updated:** 2026-10-13

A short list for choosing between options, drawn from the pragmatic-programming
tradition (Hunt and Thomas, _The Pragmatic Programmer_). A principle with no
gate is only advice, so each row names what enforces it, or the issue that will.

When two options are otherwise equal, pick the one that is easier to change and
easier to delete.

| Principle | How it shows up here | Enforced by |
| --- | --- | --- |
| **One source of truth for each fact** | `AGENTS.md` is canonical, skills are generated from commands, the API client is generated from OpenAPI. Shared helpers live in [primitives.md](primitives.md). | `pnpm check:drift`, `scripts/guardrails/command-skills.test.mjs`. `scripts/guardrails/report-error-wiring.test.mjs` keeps each app's `report-error.ts` a 3-line wiring of the shared factory. |
| **Keep parts independent** | Each API domain owns its models, router and service, with its own database where needed ([ADR-0003](../adr/0003-domain-databases.md)). Read the nested `AGENTS.md` first. | Blast-radius gate, [risk tiers](../../scripts/guardrails/risk-tier.mjs). Open: four files over 1,000 lines ([#364](https://github.com/Marcus100/grenmet/issues/364)). |
| **Prove the path end to end first** | Build the thinnest slice through every layer, then widen it ([full-stack playbook](../playbooks/full-stack-feature.md)). | `pnpm verify:changed`, staging pipeline. |
| **Make contracts explicit** | Pydantic schemas, OpenAPI, the permission catalogue and generated types. Never hand-write an API response type. | `pnpm check:drift`, `tests/auth/test_permission_registry.py`. |
| **Fail loudly and early** | Typed `AppException`s, errors reach Sentry, no silent `except`. Tie logs and errors together with a request ID. | Biome, Ruff. Open: blind `except` suppressions ([#367](https://github.com/Marcus100/grenmet/issues/367)); no request ID ([#362](https://github.com/Marcus100/grenmet/issues/362)). |
| **Fix broken windows** | No TODOs, no skipped tests, no new lint or type suppressions, no unused files. | `scripts/guardrails/suppression-ratchet.test.mjs`, `scripts/guardrails/test-timeouts.test.mjs`, `pnpm docs:check-style`, `pnpm knip:unused`. Open: unused files ([#366](https://github.com/Marcus100/grenmet/issues/366)). |
| **Test early, automatically, ruthlessly** | Tests ship with the feature; run only the checks a diff needs. | `pnpm verify:changed`, pre-push hook, CI. Coverage floors gate CI for the API and web apps auth, gms, mbia and signal; gaa-admin remains local-only ([#363](https://github.com/Marcus100/grenmet/issues/363)). |
| **Keep decisions reversible** | Additive migrations, ADRs for choices that are hard to undo. | [ADR index](../adr/README.md). Proposed: [flags](../adr/0020-feature-flags-with-success-metrics.md) and a [recovery drill](../adr/0021-timed-recovery-drill.md). |
| **Keep knowledge in plain text** | Decisions, runbooks and agent rules live in the repo, not in anyone's head. | `pnpm docs:check-links`, `pnpm docs:check-style`. Open: inconsistent doc metadata ([#365](https://github.com/Marcus100/grenmet/issues/365)). |
| **Automate repetitive work, then record what you learned** | Routines do chores; agents file what they worked around. | [routines.md](routines.md), the `file-friction` skill. |

## Applying them

- Before writing a helper, check [primitives.md](primitives.md).
- If you worked around something, run the `file-friction` skill instead of leaving a note.
- If a suppression looks necessary, fix the cause first. If it truly is necessary,
  put the reason beside it and raise the baseline with a human reviewer.
- If a principle you rely on has no gate, say so in your summary; that is itself friction.
