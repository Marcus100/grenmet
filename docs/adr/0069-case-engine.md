# ADR-0069: One case engine for safety, security, occupational health and environmental management

## Status

Accepted 25 November 2026; not built. Follows ADR-0067 decision 6, which
asks for this record before the module is built. Issues #1877 to #1879.

## Context

Four programmes an airport authority must run work the same way:

- safety management (ICAO Annex 19, the ICAO Safety Management Manual, Doc 9859);
- security;
- occupational health and safety;
- environmental management.

In each, someone raises a concern or an event happens. The risk is assessed,
someone investigates, corrective actions get owners and due dates, and the
outcome is reviewed. Hazards are kept on a register, and performance is measured
against indicators and targets.

The Eastern Caribbean Civil Aviation Authority (ECCAA) regulates Grenada's
aerodromes and follows Annex 19. No ECCAA-specific rule changes the structure
below.

Building four separate modules would repeat the same tables and rules four
times. Building one module with no programme boundary would let a security
investigator read occupational health cases, and the other way round.

## Evidence

- **Facts:**
  - Annex 19 sets the framework for a safety management system:
    - safety policy and objectives;
    - safety risk management, meaning hazard identification and risk assessment;
    - safety assurance, meaning performance monitoring and the management of change;
    - safety promotion.

    High confidence.
  - Doc 9859 uses a 5 × 5 safety risk assessment matrix:
    - likelihood from 1 (extremely improbable) to 5 (frequent);
    - severity from E (negligible) to A (catastrophic).

    A risk index such as `4B` is then mapped to tolerability (intolerable,
    tolerable, acceptable) through a table *each organisation defines*. ICAO's
    own material gives the bands only as examples. High confidence
    ([ICAO risk matrix training note](https://icao.int/TrainingDocumentation/SMI%20Website/Chapter%202%20Safety%20Management%20Fundamentals/2.5-12.%20SRM%20Methodology_Risk%20Matrix.pdf)).
  - Annex 19 asks states to protect safety data and their sources, so that people
    keep reporting. High confidence.
  - The platform already provides the building blocks:
    - organisation tenancy and organisation-bound keys (ADR-0022, ADR-0044);
    - the outbox (ADR-0026);
    - audit history (ADR-0009);
    - transition tables (`tests/test_state_machine_inventory.py`);
    - links between records (`src/record_links.py`).

    High confidence.
- **Interpretation:**
  - The four programmes differ in their categories, their wording and who may
    see them, not in their workflow. One engine with a programme boundary fits
    (best practice, high).
  - A fixed ICAO matrix would be wrong for an organisation whose tolerability table
    differs. The grid has to be configurable, with the ICAO example as its default
    (high).
- **Uncertainty:** whether security cases need extra restrictions beyond a
  confidential flag, for example under the national aviation security programme
  (medium). The confidential key below can be tightened without a schema change.

## Options considered

1. **Four domains** (`safety`, `security`, ...), each with its own copy of the
   tables. Simple to read, but four times the code, and fixes drift apart.
2. **One `cases` domain with a `programme` column, one entitlement and one set of
   keys per programme** (chosen). One workflow and one set of tests. The boundary
   is enforced by entitlement and keys.
3. **One `cases` domain and one entitlement for all four.** Cheapest, but an
   organisation could not buy safety without security, and access would not split
   by programme.

## Decision

1. **Domain and schema.** The domain is `cases`, with a `cases` schema in the
   main database (ADR-0003). Every table carries `organisation_id` and
   `programme`, which is one of:
   - `safety`;
   - `security`;
   - `occupational_health`;
   - `environmental_management`.
2. **A product and keys per programme.** Each programme is a product in
   `PRODUCTS` with organisation keys whose first segment is the programme:
   - `<programme>.cases.read` and `<programme>.cases.write`;
   - `<programme>.cases.confidential` for confidential cases and reporter
     identity;
   - `<programme>.cases.approve` for risk acceptance, investigation approval
     and closing;
   - `<programme>.settings.manage` for categories, the risk grid and indicators;
   - `<programme>.team.manage`;
   - the `<programme>.read|write` API key scopes.

   Routes are `/cases/org/{programme}/...`. One dependency checks the
   programme's entitlement and key, so a security investigator holding no
   safety key gets 403 on safety routes.
3. **Case lifecycle**, as a transition table in `transitions.py`:
   - `reported`, then `assessing`, then `investigating`, then `actions`, then
     `monitoring`, then `closed`;
   - closing locks the case;
   - reopening needs the approve key and a reason, as for incidents.

   A case's source is either:
   - a concern (manual entry, or an anonymous report where the organisation
     allows it);
   - a record reference `(kind, id)` checked through `src/record_links.py`, for
     example an incident, an inspection finding or an audit finding.

   Several incidents may link to one case.
4. **Risk.**
   - Each organisation and programme has a configurable grid: likelihood
     levels, severity levels, and a tolerability band per cell. It is seeded
     with the Doc 9859 example: 1 to 5 by E to A, with the ICAO example bands.
   - A risk assessment is stored with the labels it was made with, so later
     grid edits never rewrite history.
   - Each assessment is either `initial` or `residual` (after controls).
   - An assessment above "acceptable" needs a recorded acceptance by a holder
     of the approve key.
5. **Investigation.** One per case, holding:
   - what happened;
   - unsafe acts and unsafe conditions;
   - contributing factors from a per-programme list;
   - "5 whys" root-cause steps;
   - approval by a holder of the approve key.
6. **Corrective actions.**
   - Each action has an owner (an active member), a due date, progress notes
     and evidence photos (an upload purpose per programme).
   - An action may link to a work order once that module exists (a `(kind, id)`
     link).
   - Actions have their own transition table: `open`, then `done`, then
     `verified`, with reopen.
   - Overdue actions remind their owner through notifications.
   - A case cannot close while an action is not verified.
7. **Hazard register** (second slice):
   - hazards with controls, an owner and a review date;
   - the latest risk assessment;
   - "copy the last assessment forward" when the hazard is reviewed.
8. **Assurance** (second slice):
   - safety performance indicators as rates, for example events per 10,000
     movements, with alert levels and targets;
   - audit templates whose answers create findings, and findings that open
     cases.
9. **Protection of reporters.**
   - The reporter of a concern, and every field marked confidential, are shown
     only to holders of the confidential key.
   - Anonymous reports keep no account link at all.
   - History is audited under the organisation's subject. Confidential text is
     marked sensitive in the audit registry.
10. **Links.** The engine registers record kinds `cases.case` and
    `cases.action`. It posts to the operations log through the outbox only
    when a case is opened or closed, with no confidential text.

## Consequences

- **Easier:**
  - a fix to the workflow serves all four programmes;
  - a new programme (for example, quality management) is a new enum value,
    product and keys;
  - an organisation buys only the programmes it runs.
- **Harder:**
  - every query must filter on both organisation and programme;
  - tests must prove the programme boundary as well as the organisation
    boundary.
- **Forbidden:**
  - reading or writing a case through another programme's keys;
  - showing reporter identity or confidential text without the confidential
    key;
  - rewriting a stored risk assessment when the grid changes.
- **Slices:**
  - S1: case, grid, risk assessments, investigation, corrective actions
    (safety only);
  - S2: hazard register, indicators, audits;
  - S3: the other three programmes;
  - S4: anonymous reporting on a public form (Turnstile) and evidence photos.
