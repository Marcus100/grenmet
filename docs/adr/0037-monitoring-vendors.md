# ADR-0037: What monitoring vendors may receive

## Status

Accepted (owner decision, 2026-10-20).

## Context

Sentry receives errors from FastAPI and the Next.js apps. Better Stack is the uptime provider, configured in `scripts/monitoring/betterstack.json` (`docs/operations/analytics-monitoring.md`). `AGENTS.md` says "never put user data in Sentry". `packages/ui/src/lib/sentry-privacy.ts` turns off user info, cookies, headers, request bodies, query strings and stack variables, and its event scrubber clears `event.user`. The FastAPI side keeps a matching `SAFE_TAGS` list in `apps/api/fastapi/src/telemetry.py`.

## Decision

1. Sentry (errors) and Better Stack (uptime) may receive technical data plus internal user and organisation IDs.
2. They must never receive names, emails, phone numbers, booking or message contents, or request bodies.
3. The `AGENTS.md` rule is refined: "never put user data in Sentry" becomes "never put personal data in Sentry; internal user and organisation IDs are allowed".
3a. Owner decision 2026-10-21: the Sentry `org_id` tag may carry the organisation's readable id (slugs such as `gaa`, `babydoll`, `barrels`). They are business identifiers, not personal data, and Barrels owns them (ADR-0033).
4. Next step: evaluate self-hosted, free and open-source GlitchTip (errors) and Uptime Kuma (uptime) on the droplets. Use them as a replacement if free tiers end, or for data control.

## Consequences

- The scrubber currently drops `event.user` entirely. Sending IDs needs a small change that passes only an allowlisted ID, plus tests. That change is not part of this ADR.
- The `AGENTS.md` wording changes with the lane that implements this decision (the monitoring-IDs PR, plan lane 1.5), not with this ADR.
- Organisation ids are readable slugs and are accepted as is. If a client ever objects, switch to a salted hash.
- Any new monitoring vendor needs an ADR amendment before it receives data. Prefer self-hosted open-source options (free/open-source preference).
- GlitchTip speaks the Sentry protocol, so a move is mainly a DSN change. Uptime Kuma needs its own check list to replace `betterstack.json`.
- Hosting them on the droplets adds load and an upkeep task, and they must themselves be monitored.
