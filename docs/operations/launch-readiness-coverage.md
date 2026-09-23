# GMS September 2026 launch readiness

Report date: **28 September 2026**. Intended launch: **30 September 2026**.
GAA is the client organisation; GMS is its meteorological department.
Interim hosting is on barrels.gd. This record is evidence, not operational sign-off.

## Evidence baseline

Claude reported results on 23 September at revision `311b55d4`: gaa-admin
336 passing tests, GMS 154, auth 40, CMS 20 passing and five skipped, and
workspace type-check 16/16. Original logs are in Claude's private scratchpad
and have not been independently reproduced for this record. Its reported
169/227 API usage count is a static reference count, not workflow coverage.

Run `python3 scripts/audit/api-ui-coverage.py` for a reproducible JSON inventory.
It excludes tests and marks method-unverified path candidates separately from
generated symbols. Trace dynamic paths manually; absence of a candidate does
not prove absence of an interface. Retain command, revision, date and environment
with each verification result. Never place credentials or personnel data here.

## Journeys

| ID | Required outcome | Current evidence / next verification |
| --- | --- | --- |
| J-Access | Sign in, use authorised actions, deny unauthorised actions, sign out | Browser and API role checks pending; visible navigation does not grant permission |
| J-Forecast | Save/reopen, preview, publish, correct and expire; draft edits preserve published snapshot | Connected browser-to-public verification pending |
| J-CMS | Publish editorial content and verify its intended public location and freshness | Source mapping and measured update delay pending |
| J-CAP | Validate, submit/review/approve as required, publish, update/cancel; verify intended feeds | Existing lifecycle plus new administration gaps; browser verification pending |
| J-Obs | Save/reopen, validate, encode, finalise, correct and retrieve revisions | API currently lists, creates and performs limited SYNOP validation; full lifecycle pending |
| J-SYNOP | Trace an observation through SURFACE to a retrievable BUFR artifact and matching WIS2 notification | Sandbox integration pending; no production cutover authorised by this record |
| J-Aviation | Encode and validate TAC/IWXXM; distinguish manual submission, automated submission and receiver acceptance | Converter, profile and transport selection pending |
| J-HR | Complete chosen staff/approver tasks with persistent state and enforced permissions | Select and verify tasks using controlled test records |
| J-Docs | Find guides through navigation/search and follow links on desktop/mobile | Documentation hub implementation and checks pending |

For each result append the date, revision/dirty-worktree scope, environment,
command or steps, outcome and unresolved dependency. Unit tests alone do not
mark a connected journey passed.

## Delivery batches

1. Evidence inventory and journey record.
2. Documentation hub: preserve all URLs and hurricane material; replace fictional API guides.
3. Public website design and CMS/forecast/CAP integration.
4. CAP administration within actual API capabilities.
5. eRegister lifecycle and imported-observation view.
6. SURFACE/WIS2 sandbox handoff using the existing publisher.
7. Aviation conversion, validation and submission tracking.
8. Additional HR/account actions, release checks and audience-specific reports.

Keep deferred modules visible: Services, Climate & Data, Operations, Bus,
Janitor, Stores, IT Tickets, Resources and salesbus. Their presence is not a
claim of operational readiness. Bus/Janitor portal integration and later PWAs
remain roadmap work.

## Decisions and external dependencies

- Aviation receiving interface, profile and acceptance evidence remain unresolved.
  Validated downloads and manually recorded submissions must not imply receipt.
- Verify and pin an IWXXM release against receiver requirements; do not assume
  an older version is the latest.
- Follow ADR-0010: SURFACE owns WIS2 publication; wis2box performs conversion.
  Select the supported ingestion interface after inspecting existing contracts.
- Operational acceptance owners remain to be named by Eugine.
- Intended default: launch verified website/staff capabilities even if automated
  transmission remains pending, retaining the currently accepted submission route.
  Confirm the actual operational fallback; SURFACE's experimental status means
  its presence alone does not establish that it is the accepted live route.
- Preserve submitted memorandum originals. Publish the September 28 report as
  readiness at that date, followed by a dated update after launch.

## Release evidence still required

Relevant migrations, service configuration, backup restore, monitoring, host-backed
FastAPI tests, staging journeys and staff walkthrough. Deployment remains Eugine's
action. Identify the actual workflow and rollback procedure before documenting commands.

## Implementation evidence — 23 September

Codex working tree based on `311b55d4`, with concurrent Claude docs-navigation work preserved:

- Added reproducible API-reference audit with five matcher regression tests.
- Replaced eleven fictional docs pages with current GMS guidance. The homepage
  is a document catalogue; the original hurricane introduction is preserved at
  `/hurricane-plan`. Staff guidance is the second collection at `/quickstart`.
  All existing chapter URLs remain. Claude separated sidebar navigation by
  document; Codex made previous/next navigation respect the same boundary.
- Added six CAP administration screens: settings, feeds, areas, audit, import
  and read-only integrations. Alert pages link to filtered audit history. The
  composer now reads message types, statuses, scopes and language suggestions
  from the authenticated catalogue. Import creates a draft before saved-record
  validation: the API has no separate non-persisting import preview.
- Added the imported-observation view at `/wxproducts/hourly?view=imported`,
  with server-side session forwarding, generated response validation, UTC
  filters and distinct empty/error states. Staff records remain separate.
- `pnpm test:docs`: 20 passed, including Claude's navigation regression.
- The reproducible API/UI audit reports 152 candidate-referenced operations of
  227; its five unit tests pass. This is a different heuristic from Claude's
  historical 169 count, not evidence of lost functionality or verified journeys.
- Full gaa-admin suite: 351 passed across 76 files. Subsequent composer
  catalogue change: 13 focused composer/admin-form tests passed, including
  one added catalogue test. The full suite has not been repeated after that change.
- Docs production build passed after the catalogue layout change. Workspace
  type-check passed 16/16; final post-change checks are recorded in the session log.
- Built homepage HTML contains the catalogue title and both document links.
- Browser verification remains pending: `host.docker.internal:3002` refused
  connection from the devcontainer both inside and outside the sandbox.
  No staging/production deployment or live transmission was performed.

### Next integration decisions

WMO's [release list](https://github.com/wmo-im/iwxxm/releases) identifies
2025-2 as latest; 2023-1 must not be described as latest. Receiver compatibility
still determines the operational target.

The converter source declares `tac2iwxxm` version 2026.9.22, MIT licensing and
Python >=3.12, with separate TAC and XML validation packages. This is source
inspection, not a verified installation or Python 3.14 compatibility result.
The [validator documentation](https://github.com/EMPIRIC2/TAC-to-IWXXM/tree/main/packages/iwxxm-validate)
warns that pure-Python Schematron stages can be skipped. Required skipped stages
must prevent full-validation status. New dependency evaluation/integration
approval has been requested; no dependency or API contract changed in this batch.

The WIS2 runbook records a historical sandbox success on 8 July. That does not
verify the new eRegister handoff. The inspected SURFACE `/api/rawdata/` handler
is a read interface, not evidence of a supported ingestion endpoint. Do not
implement direct database writes merely because a read endpoint exists.

Remaining launch work includes public-site/CMS browser audit, eRegister encoding
and lifecycle, SURFACE handoff, aviation conversion/transmission, additional HR
actions, production recovery verification and the September 28 report pack.
