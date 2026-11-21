# ADR-0033: Barrels Grenada owns the data on its platforms

## Status

Accepted (owner decision, 2026-10-20). **Amended 21 Nov 2026** (owner decision, confirming 12 Nov 2026): GAA and GMS own their data, and Barrels only processes it for them under agreement; decision 1 no longer applies to GAA and GMS data (see "Amendment (2026-11-21)" below). Health records are an exception under ADR-0062 (accepted 18 Nov 2026): each practice is the data user and Barrels the processor. Commerce business records follow ADR-0063 (accepted 21 Nov 2026): each business controls its own records. The original decision is kept below as history.

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

- The intention is that Barrels is the legally responsible controller for that data, subject to the GAA contract. If so, privacy duties, access requests, erasure and breach notice are Barrels' to handle. The GAA contract should say this in writing.
- Existing data-request handling and the security baseline (`docs/security.md`) now serve Barrels' own duties, not only the client's.
- Until the contract says so in writing, this is an owner decision, not a signed term. Treat the written contract as the open item.
- Documents marked `Owner: GAA/GMS` are unaffected unless they describe data; review them when the `AGENTS.md` line changes.

## Amendment (2026-11-21): GAA and GMS own their data

Owner decision of 21 Nov 2026, confirming the owner's 12 Nov 2026 direction.
Decisions 1 and 6 and the first Consequence above are history, not the current
rule.

1. **GAA and GMS own their data.** That covers GAA and GMS operational, HR and
   weather data held on Barrels platforms. Barrels only processes it for them,
   under agreement with GAA. GAA (with GMS) is the controller; Barrels is the
   processor.
2. **Barrels still owns the software** (decision 2 stands), and client marks
   stay with the client (decision 3 stands).
3. **Barrels' own products keep Barrels as the platform owner.** In Barrels
   Events, Bookings and the other Barrels products, Barrels owns and runs the
   platform, and each business controls its own records on it, as ADR-0063
   already says for Commerce (Shop Keeper and Salesbus).
4. **Health records** stay as ADR-0062 decided: each practice owns its charts
   and Barrels is the processor.
5. Decisions 4, 5 and 7 stand: separate databases stay for retention and risk
   reasons; the public repository rules are unchanged; the GAA contract should
   state the arrangement in writing (now as a processing agreement).
6. The root `AGENTS.md` line now reads that Barrels Grenada owns the software
   and that GAA and GMS own their data, which Barrels processes.

Consequences of the amendment:

- Privacy duties toward GAA and GMS staff and the public (access requests,
  erasure, breach notice) are carried out by Barrels on GAA's instructions, as
  a processor, not as Barrels' own controller duties. The security baseline
  (`docs/security.md`) still applies in full.
- Documents marked `Owner: GAA/GMS` that describe data are now consistent with
  this record.
