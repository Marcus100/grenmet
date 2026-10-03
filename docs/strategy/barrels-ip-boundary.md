# Barrels and Client IP Boundary

**Status:** Owner decision recorded 2026-10-03; licence text and GAA agreement pending legal review  
**Recorded:** 2026-09-23  
**Owner:** Barrels Grenada

## Purpose

Records how repository assets divide between Barrels Grenada intellectual
property and client (GAA/GMS) property, and what remains to be agreed with GAA.
It supports the commercial and legal gate in the
[Barrels Portfolio Implementation Plan](../portfolio/barrels-portfolio-implementation-plan.md).

This page states Barrels' position. It has no legal effect on its own and does
not replace any signed agreement.

## Position

All software in this repository is Barrels Grenada IP. GAA is Barrels' first
client; its right to use the software comes from a licence granted by Barrels,
not from ownership. GAA keeps ownership of its own data, marks, and documents.

Until 2026-10-03 the `README.md` licence line read "Proprietary — Grenada
Airports Authority (GAA) / Grenada Meteorological Service (GMS)", which would
have prevented Barrels from reusing shared capabilities (see the
[AI and data platform strategy](barrels-ai-strategy.md)) for other clients.

| Class | Assets | Position |
| --- | --- | --- |
| Barrels platform IP | `packages/ui`, `packages/theme`, `packages/auth`, `packages/email-templates`, `packages/tsconfig`, API-client generation tooling; FastAPI `auth`, `audit`, `notifications`, `storage`, `billing`, `worker`; deployment and engineering tooling | Owned by Barrels |
| Barrels product IP | `apps/web/events`, `apps/web/signal`, `apps/web/auth`, future Barrels Core domains | Owned by Barrels |
| Software built for clients | GMS domains (`cap`, `wxproducts`, `wxwatch`, `eregister`), staff platform (`hr`, roster, workflow, `janitorial`, `transport`, `baseline`) and client apps (`apps/web/gms`, `apps/web/gaa-admin`, `apps/web/mbia`, `apps/web/docs`, `apps/web/cms`) | Owned by Barrels; licensed to the client by agreement |
| Client data and documents | GAA/GMS operational data and records; official products and warnings; CMS content; documents marked `Owner: GAA` or `Owner: GMS` (for example `docs/internal/`) | Owned by the client |
| Client names and marks | GAA/GMS names and logos (`packages/gms` brand assets) | Remain the marks of their owners; used under licence |
| Third-party code | Vendored stacks (`surface/`, `wis2box/`, `geonetcast/`) and template code; see `VENDORED.md` | Keep upstream licences |

## Open questions

GAA's licence scope, data residency, support, liability, and exit terms remain
to be agreed in writing. Until then this page records Barrels' position only.

## Draft root `LICENSE`

Not yet in force; bracketed items are placeholders to settle with counsel.

```text
Copyright (c) 2026 [Barrels Grenada legal entity name]. All rights reserved.

This repository and its contents are proprietary to Barrels Grenada
("Barrels"), including software built for Barrels clients, except as set out
below. No licence is granted to copy, modify, distribute, sublicense or use any
part of it except under a written agreement with Barrels.

1. Client materials. Client data, and documents marked as owned by the Grenada
   Airports Authority (GAA), the Grenada Meteorological Service (GMS) or
   another client, belong to that client.

2. Client trademarks. Names, logos and other marks of GAA, GMS and other
   clients remain the marks of their owners and are used under licence.

3. Client use. Clients, including GAA, may use the software only as granted
   in their written agreement with Barrels [title and date of agreement].
   Unless that agreement says otherwise, the software is provided "as is",
   without warranty, and Barrels' liability is limited as set out there.

4. Third-party software. Directories carrying their own licence file or listed
   in VENDORED.md (including surface/, wis2box/, geonetcast/ and template code
   in apps/web/gaa-admin) remain under their original licences, which prevail
   for those files.

Contact: [legal contact email]
```

The `README.md` licence section (adopted 2026-10-03) summarises this. Link it to
`LICENSE` once the file is finalised.

## Next step

Agree the GAA licence in writing, then add the root `LICENSE` with the agreed
entity name and terms.
