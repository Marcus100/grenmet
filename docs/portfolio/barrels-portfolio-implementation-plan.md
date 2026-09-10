# Barrels Grenada Portfolio Implementation Plan

**Status:** Authoritative portfolio plan  
**Effective:** 2026-08-16  
**Horizon:** Five-year strategy expressed through dependency horizons  
**Owner:** Barrels Grenada

## Purpose

This plan turns the
[Barrels Grenada Product Strategy](../strategy/barrels-product-strategy.md) into
an executable portfolio sequence. It covers company products, client delivery,
shared platform investment, operational obligations, and repository evolution.
It does not replace product specifications, client approvals, ADRs, or
operational runbooks.

The [planning index](README.md) defines the vocabulary and authority model. The
[client programme plan](gaa-gms-client-programme-plan.md) governs GAA/GMS
outcomes, and the [repository delivery map](repository-delivery-map.md) maps
this plan to implementation surfaces.

## Portfolio policy

1. Events and Tickets is the first transactional Barrels product and receives
   the default share of discretionary product capacity.
2. GMS safety, compliance, continuity, and live-operational needs may pre-empt
   Events. The reason and recovery point must be recorded when this happens.
3. Client delivery and Barrels products remain separate even when they reuse
   identity, workflow, UI, data, or deployment capabilities.
4. Shared platform work must be pulled by an approved product or client need;
   speculative platform construction is not a portfolio objective.
5. Dates are commitments only after capacity, dependencies, acceptance owners,
   and external approvals are confirmed. Otherwise work uses Now, Next, Later,
   or Explore.
6. Productization of client software is a separate decision requiring evidence
   of reuse, commercial demand, rights, supportability, and tenant isolation.

## Portfolio register

| Initiative | Classification | Current state | Horizon | Portfolio outcome | Acceptance authority |
| --- | --- | --- | --- | --- | --- |
| Barrels platform transition | Company/platform programme | In progress; transition boundaries 1–2 complete and boundary 4 work visible in the worktree | Now | Company, product, and client identities are separated without disrupting working services | Barrels |
| Events and Tickets | Barrels product | Organiser-console prototype; product definition contains unresolved scope | Now → Next | Prove discovery → sale → admission → settlement with trusted organisers | Barrels product owner |
| Signal | Barrels media product | Working content-led application with component tests | Later | Maintain a distinct trusted media product and validate its role in the Barrels portfolio | Barrels product owner |
| Barrels corporate hub and control plane | Company surfaces | Planned, not present as applications | Next | Establish the company entry point and a Barrels-only operational control plane | Barrels |
| GAA/GMS engagement | Client portfolio | Multiple active workstreams at different maturity levels | Now → Later | Deliver accepted institutional outcomes without classifying the client as a product | Joint Barrels and GAA/GMS owners |
| MBIA passenger experience | GAA public-service delivery | Working application; deployment and institutional boundary need reconciliation | Later | Deliver a distinct airport passenger service, separate from GAA staff tooling | GAA/airport owner |
| GAA corporate surface | GAA public-service delivery | Reserved, not built | Later | Provide a GAA institutional site distinct from MBIA and staff administration | GAA |
| Reusable workforce product | Productization option | Not approved; reusable architecture direction exists | Explore | Decide whether proven GAA staff capabilities warrant a separate Barrels product | Barrels after GAA delivery evidence and rights review |
| Streaming/media platform | Barrels product option | Early product brief only | Explore | Validate audience, rights, operating model, and economics before investment | Barrels |
| Shop, Salesbus, and other transactions | Barrels product options | Reserved identities or prototypes only | Explore | Promote only when evidence and operating capacity justify a product | Barrels |

## Dependency roadmap

### Now — establish trustworthy boundaries

- Complete transition boundaries 3–8: neutral shared contracts, GMS package
  extraction, Barrels brand interfaces, and the GMS/GAA application renames.
- Keep current application behavior stable while retiring company-wide uses of
  the legacy `GrenMet` ownership identity. Preserve GMS terminology where it
  names the institution, service, assets, or meteorological capability.
- Treat the GAA staff portal, GMS public site, GMS documentation surface,
  Barrels admin, and Barrels corporate hub as distinct applications.
- Reconcile deployment, documentation, quality reporting, and repository names
  with the transition state after each approved boundary.
- Continue GMS operational work where it closes a safety, compliance,
  continuity, observation, warning, or data-publication gap.
- Advance Events discovery and specification without coupling the prototype to
  GMS-specific presentation or incomplete platform identities.

**Exit gates**

- Neutral shared UI/theme contracts exist and GMS-specific assets live in the
  GMS package.
- GMS public, GMS documentation, and GAA staff-portal boundaries are explicit
  in code, hosts, navigation, and documentation.
- Events has an approved v1 problem statement, actor model, operational loop,
  payment/payout feasibility decision, and pilot acceptance criteria.
- Active GMS operational priorities have named institutional owners and
  acceptance evidence.

### Next — prove the first complete loops

- Deliver an Events pilot through discovery, organiser setup, publication,
  registration or payment, ticket issuance, offline-capable admission,
  exceptions, and settlement reporting.
- Revalidate the brainstormed Spicemas 2027 target before treating it as a
  release commitment.
- Establish the GMS observation-publication pilot from Sutron collection and
  SURFACE through WIS2 publication, monitoring, archive, recovery, and staff
  acceptance.
- Complete the GMS warning loop from authoring through review, approval, CAP
  publication, dissemination, archive, and post-event verification.
- Harden the GAA staff-platform core and current HR/roster workflows in the GMS
  pilot before onboarding another department.
- Establish the Barrels corporate hub and a separate minimal Barrels control
  plane after their transition dependencies land.

**Exit gates**

- A trusted organiser completes an Events pilot and reconciliation succeeds.
- GMS signs off defined observation/WIS2 and warning operational exercises.
- The GAA staff pilot demonstrates scoped access, workflow auditability,
  reliable roster/HR behavior, and an agreed support model.
- Shared identity and deployment support distinct product/client branding and
  application-scoped access.

### Later — expand only proven capabilities

- Expand Events according to pilot evidence: directory coverage, ticketing,
  diaspora gifting, organiser operations, support, and analytics.
- Onboard GAA departments one at a time using configuration rather than
  department-specific forks.
- Extend GMS public, aviation, marine, climate, agriculture, hydrometeorology,
  and partner decision-support services after operational approval.
- Develop Signal, MBIA, and GAA public surfaces according to their own product
  or client measures rather than treating them as migration checkboxes.
- Evaluate commercialization of the workforce platform only after the GAA
  programme proves reuse and the commercial/legal gates are resolved.

### Explore — preserve options without implying commitment

- Streaming, unified media subscriptions, advanced offline delivery, and
  creator payouts.
- Loyalty, commerce, bookings, transport, and regional expansion. Loyalty
  reference products and the merchant-funded/platform-funded decision are
  surveyed in the
  [Loyalty and Gamification Reference Study](../strategy/loyalty-reference-study.md).
- A production weather-data proxy beyond the Hono health stub.
- Native applications and deeper multi-tenant product infrastructure.
- Research and training assets until an explicit adoption decision gives them
  a supported owner and service level.

## Capacity and interruption rules

- **Default:** product capacity advances Events after its current dependency
  gates; client capacity advances accepted GAA/GMS work.
- **Safety override:** a meteorological safety, compliance, continuity, or live
  operational incident may interrupt either lane.
- **Client commitment:** a formally accepted GAA milestone competes within the
  client lane unless an executive decision explicitly changes Barrels product
  investment.
- **Platform work:** is scheduled with the initiative that needs it and is not
  counted as an independent product outcome.
- **Recovery:** every interruption records what paused, why, the responsible
  authority, and the condition for resuming the displaced work.

## Measures and review cadence

| Level | Measures |
| --- | --- |
| Portfolio | Initiatives passing gates; active work with named owners; capacity lost to unplanned work; institutional renewals; product continuation/stop decisions |
| Events | Verified organisers, event coverage, purchase completion, admission success, reconciliation accuracy, support/refund resolution |
| GAA client delivery | Accepted workflows, department adoption, manual effort reduced, support load, audit completeness |
| GMS operations | Warning dissemination time, observation latency/completeness, WIS2 publication success, recovery exercises, product verification |
| Platform | Authentication reliability, deployment success, backup restoration, incidents, API/client drift, quality checks |

- Review active horizons monthly.
- Review GAA/GMS programme acceptance jointly at least quarterly.
- Review product continuation, deepening, or stopping at each evidence gate.
- Review the five-year strategy annually without converting unvalidated options
  into delivery promises.

## Explicit boundaries

- This plan does not approve payments, production cutovers, infrastructure
  purchases, public warning policy, or changes to operational thresholds.
- GAA and GMS data ownership, software rights, residency, support, and exit
  terms remain commercial/legal gates until formally agreed.
- A repository prototype is not a launched product, and implemented code is
  not proof of institutional acceptance.

