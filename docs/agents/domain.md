# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase. This repo is **single-context**: one glossary for the whole monorepo.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root — the project's glossary and domain overview.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md            ← created lazily; not yet present
├── docs/adr/
│   ├── 0001-monorepo.md
│   ├── 0002-shared-auth-session.md
│   ├── 0003-domain-databases.md
│   ├── 0004-generated-api-client.md
│   ├── 0005-compose-traefik-deployment.md
│   ├── 0006-design-system-governance.md
│   ├── 0007-cap-warning-lifecycle.md
│   └── README.md
├── apps/
└── packages/
```

If this repo later grows distinct per-app domains, graduate to multi-context: add a `CONTEXT-MAP.md` at the root pointing to per-app `CONTEXT.md` files (e.g. `apps/web/<app>/CONTEXT.md`), and check `apps/web/<app>/docs/adr/` for context-scoped decisions where present.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (CAP warning lifecycle) — but worth reopening because…_
