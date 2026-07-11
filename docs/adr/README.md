# Architecture Decision Records

This directory records durable architecture decisions for GrenMet. ADRs should describe choices that affect code structure, deployment, data ownership, security, or operational behavior.

## Index

| ADR | Decision |
| --- | --- |
| [0001](0001-monorepo.md) | Use a pnpm/Turborepo monorepo |
| [0002](0002-shared-auth-session.md) | Use shared auth with opaque browser sessions |
| [0003](0003-domain-databases.md) | Keep separate domain databases on shared PostgreSQL |
| [0004](0004-generated-api-client.md) | Generate the TypeScript API client from FastAPI OpenAPI |
| [0005](0005-compose-traefik-deployment.md) | Deploy with Docker Compose and Traefik on dedicated droplets |
| [0006](0006-design-system-governance.md) | Govern shared UI through GrenMet design-system tokens and packages |
| [0007](0007-cap-warning-lifecycle.md) | Model warning operations with a CAP-aware lifecycle |
| [0008](0008-hr-approval-workflow.md) | Route HR forms through a named-approver approval workflow |
| [0009](0009-gaa-staff-platform.md) | Build a GAA-wide staff platform, piloted in Meteorology |
| [0010](0010-wis2-publishing-via-surface-builtin.md) | Publish observations to WIS2 via SURFACE's built-in publisher |

## Template

```markdown
# ADR-XXXX: Title

## Status

Accepted | Proposed | Superseded

## Context

What forces or constraints led to this decision?

## Decision

What did we choose?

## Consequences

What does this make easier, harder, or forbidden?
```

