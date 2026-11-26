# ADR-0069: One case engine for safety, security, occupational health and environmental management

## Status

Proposed 25 November 2026; not built. Follows ADR-0067 decision 6, which
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
   - `aviation_security`;
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

   - Routes are `/cases/org/{programme}/...`, with kebab-case path values
     (`safety`, `aviation-security`, `occupational-health`,
     `environmental-management`).
   - A new dependency maps the path value to the programme, then checks that
     programme's entitlement and key with the same rules as
     `require_org_permission`. A security investigator holding no safety key
     gets 403 on safety routes.
   - The `<programme>.read|write` API key scopes exist because every product
     has them. They never return confidential fields or reporter identity.
   - **Confidential keys are grant-only.** `<programme>.cases.confidential` is
     never held implicitly by an owner or admin role. It is excluded in
     `grants.effective_keys`, which amends ADR-0044, and must be granted to a
     named person. Without this, every organisation admin would see every
     reporter and all occupational health detail.
   - **Granting it.** The only bundle that holds the key is
     `<programme>-confidential`. An organisation **owner** may grant or revoke
     it without holding it. This is the one exception to the rule that a
     grantor holds every key they give.
     - The grant needs a session that passed two-step sign-in.
     - It is audited with the grantor.
     - It is never self-granted.
     - Nobody else may grant it, including holders of `<programme>.team.manage`.
   - **The ADR-0044 amendment** covers every place in `grants.py` that assumes
     owners and admins hold all keys: `effective_keys`, `_supported_grant_ids`
     (whether a grant survives a revoke), `_expiry_ceiling` and
     `end_issued_transitively`:
     - for holding the key, confidential keys count only through a live grant;
     - `_require_may_change` skips the held-keys check for the
       `<programme>-confidential` bundle, for owners only;
     - a `<programme>-confidential` grant is supported while its grantor is
       an active owner, so a revoke cascade elsewhere never ends it;
     - when that owner leaves or is demoted, every confidential grant they
       issued ends (`end_issued_transitively` covers demotion for this
       bundle).
     - The two-step check reuses `src/auth/privileged_mfa.py`.
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
   - Every band has a fixed meaning, `acceptable`, `tolerable` or
     `intolerable`, in that order. An organisation may relabel and recolour the
     bands, but not change what they mean. The meaning is stored in each
     assessment's snapshot.
   - Following Doc 9859:
     - an `acceptable` risk needs no acceptance;
     - a `tolerable` residual risk needs a recorded acceptance by a holder of
       the approve key;
     - an `intolerable` risk can never be accepted.
   - A report that turns out to have no hazard, or is not substantiated,
     closes as `closed, no risk found`. That needs the approve key and a
     reason, and it is audited.
   - Any other case closes only when its latest residual assessment is `acceptable`,
     or `tolerable` with a recorded acceptance. A case with no residual
     assessment, or with an intolerable one, cannot close: the activity stops
     or is mitigated, and the risk is assessed again.
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
   - The audit actor of an anonymous or confidential report is not recorded:
     the report is written with no actor set, so Barrels staff reading the
     audit log cannot identify the reporter. Later changes by investigators
     and managers are attributed to them as usual.
10. **Links.** The engine registers record kinds `cases.case` and
    `cases.action`.
    - Their resolvers check the read key of the case's own programme, and hide
      confidential cases from anyone without the confidential key.
    - Posting to the operations log, when a case opens or closes, is a
      per-programme setting. It is on for safety and off by default for
      aviation security and occupational health, and never carries
      confidential text.
11. **Storage rules.**
    - `programme` is text with a check constraint, not a Postgres enum.
    - Child tables (assessments, investigation, actions) carry a composite
      foreign key on `(case_id, organisation_id, programme)`, so a row can
      never join a case of another organisation or programme.

## Consequences

- **Easier:**
  - a fix to the workflow serves all four programmes;
  - a new programme (for example, quality management) is a new value in the
    check constraint (a small migration), a product and its keys;
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
