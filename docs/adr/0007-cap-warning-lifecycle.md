# ADR-0007: Model Warning Operations With A CAP-Aware Lifecycle

## Status

Approval gate: [ADR-0013](0013-cap-alert-self-publish-and-bulletin-linkage.md)
dropped the mandatory Submitted/Approved gate, and
[ADR-0023](0023-cap-approval-before-publish.md) restored it on 2026-10-18: a
different person must approve a CAP alert before it is published. ADR-0023 is
the current rule. The CAP-XML snapshot, audit trail, and public-feed decisions
below stand.

## Context

GMS warning products need structured content, review, approval, publication, public feeds, XML snapshots, and auditability.

## Decision

Use a CAP-aware lifecycle in FastAPI: draft, submitted, approved, published, expired, and cancelled. Store CAP XML snapshots and audit events. Expose public CAP feeds separately from authenticated management routes.

## Consequences

- Warning records are operational records and should not be casually deleted.
- Permission checks govern lifecycle transitions.
- Publication requires successful validation before XML snapshot generation.
- Public feeds can serve website, map, RSS, and CAP XML consumers.
- Multi-channel dissemination is only durable job-event creation until a worker is deployed.

