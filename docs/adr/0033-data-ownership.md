# ADR-0033: Barrels Grenada owns the data on its platforms

## Status

Accepted (owner decision, 2026-10-20).

## Context

`AGENTS.md` says software is Barrels IP, but that client data, marks and `Owner: GAA/GMS` docs are GAA's. That left the ownership of operational, HR and weather data on Barrels platforms unclear. The owner has now decided it.

## Decision

1. Barrels Grenada owns all data held on its platforms, effective now. That includes GAA and GMS operational, HR and weather data.
2. Barrels also owns the software.
3. Client marks (names, logos, photos, copy) stay with the client, as in `apps/web/babydoll/AGENTS.md`.
4. Separate databases for weather and operations data stay (ADR-0003). The reasons are retention and risk, not ownership.
5. The public repository rules do not change:
   - Confidential material stays out of git, in gitignored `/private/`.
   - Client marks and personal data never go into the repo.
   - The Sentry and telemetry rules are unchanged (see ADR-0037).
6. Update the `AGENTS.md` line that calls client data GAA's so it matches this decision.
7. Recommend that the GAA contract states this in writing.

## Consequences

- Barrels is the legally responsible controller for that data. That means privacy duties, access requests, erasure and breach notice are Barrels' to handle.
- Existing data-request handling and the security baseline (`docs/security.md`) now serve Barrels' own duties, not only the client's.
- Until the contract says so in writing, this is an owner decision, not a signed term. Treat the written contract as the open item.
- Documents marked `Owner: GAA/GMS` are unaffected unless they describe data; review them when the `AGENTS.md` line changes.
