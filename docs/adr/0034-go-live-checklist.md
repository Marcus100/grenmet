# ADR-0034: A simple go-live checklist

## Status

Accepted (owner decision, 2026-10-20).

## Context

Nothing on Barrels is live today. The Babydoll website is live (static, on Vercel at `babydoll.barrels.gd`), but its bookings still go to Acuity (`apps/web/babydoll/AGENTS.md`). Treating every schema as precious now would slow building. Treating a live product casually would risk real data.

## Decision

1. A product is "testing" until it passes two checks:
   - Automated backups are running and one restore has been verified.
   - Monitoring is on: error reporting and an uptime check.
2. While testing, schema changes may be destructive or cheap. Reset a database if that is simpler.
3. After go-live, migrations must be additive and reversible. Data is never dropped without a backup.
4. Live payment mode needs one more gate. It also waits on the payout question in ADR-0027 (its live gate: owner enables a live provider, accountant and legal sign-off, reconciliation passes).

## Consequences

- The backup workflow (`.github/workflows/backup-database.yml`) and the restore drill (`docs/operations/restore-drill.md`, ADR-0021) are the evidence for check 1. The drill has not yet been run (`docs/infrastructure.md`).
- Check 2 depends on Sentry and Better Stack (ADR-0037). External uptime monitoring is listed as not yet built in `docs/infrastructure.md`.
- "Go-live" is declared per product, by the owner, and recorded in that product's domain `AGENTS.md`.
- The "Ask first" rule on destructive schema changes in `AGENTS.md` still applies; this ADR only says when such changes stop being cheap.
