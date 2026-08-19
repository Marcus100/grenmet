# Portfolio Planning System

**Status:** Authoritative planning index  
**Effective:** 2026-08-16  
**Owners:** Barrels Grenada and designated GAA/GMS programme authorities

This directory is the entry point for planning work across the Barrels Grenada
repository. It separates company products, client programmes, and repository
delivery while preserving the dependencies among them.

## Authoritative views

| View | Governs | Does not govern |
| --- | --- | --- |
| [Barrels Portfolio Implementation Plan](barrels-portfolio-implementation-plan.md) | Company priorities, products, investment sequence, and portfolio gates | GAA/GMS operational policy or implementation-level task detail |
| [GAA/GMS Client Programme Plan](gaa-gms-client-programme-plan.md) | GAA institutional outcomes, GMS operational services, staff-platform rollout, and acceptance | Barrels product investment outside the client engagement |
| [Repository Delivery Map](repository-delivery-map.md) | Ownership, maturity, lifecycle, and dependencies for every repository surface | Product strategy or institutional approval |

The three views must be read together. None is a replacement for the others.
Specialist specifications, ADRs, runbooks, and catalogues remain authoritative
inside their narrower domains.

## Classification rules

- **Barrels product:** a market-facing product whose strategy and commercial
  direction are owned by Barrels Grenada.
- **Barrels platform:** reusable company capabilities that support products and
  client delivery without inheriting a client's identity.
- **Client programme:** work commissioned for an institution and accepted by
  that institution. A client programme is not a Barrels product.
- **Operational system:** software or infrastructure used to deliver a live
  institutional function, including systems with independent release cycles.
- **Research/reference asset:** training, exploration, or source material that
  has not passed an adoption gate into a supported product or operational
  service.

Grenada Airports Authority (GAA) is the client organisation. Grenada
Meteorological Service (GMS) is a department of GAA and the operational
authority for meteorological services. Barrels Grenada is the software company
and delivery partner. GAA and GMS are not Barrels products.

## Decision authority

| Decision | Accountable authority |
| --- | --- |
| Barrels product strategy and investment | Barrels Grenada |
| Software architecture and engineering quality | Barrels Grenada |
| GAA institutional priorities and department rollout | GAA |
| Meteorological policy, warning thresholds, and official products | GMS/GAA |
| Client operational acceptance | Relevant GAA/GMS owner |
| A joint milestone | Both its Barrels delivery owner and institutional acceptance owner |

Implementation evidence comes from code, tests, and deployed-system checks.
Approval, production use, signatures, contracts, and operational acceptance
must be supported by their own records; they are never inferred from code.

## Planning vocabulary

The portfolio uses dependency horizons rather than unsupported dates:

- **Now:** active work or prerequisites that unblock approved priorities.
- **Next:** work ready after named Now gates pass.
- **Later:** valid work that depends on Next outcomes or additional capacity.
- **Explore:** an option requiring discovery or a separate investment decision.

Events receives the default share of discretionary product capacity. A GMS
safety, compliance, continuity, or live-operational need may pre-empt that
priority. Pre-emption changes sequencing, not ownership.

## Change protocol

1. Add or materially change a product or programme in its governing plan.
2. Add its repository surfaces to the delivery map before or with the code.
3. Link detailed requirements instead of copying them into the portfolio views.
4. Record the owner, acceptance authority, horizon, dependencies, and status
   evidence.
5. Run `pnpm docs:check-portfolio`, `pnpm docs:check-links`, and
   `pnpm test:docs`.

