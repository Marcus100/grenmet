# ADR-0007: Model Warning Operations With A CAP-Aware Lifecycle

## Status

Accepted

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

