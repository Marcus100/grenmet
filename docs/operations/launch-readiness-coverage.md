# GMS September 2026 launch readiness

Evidence updated: **23 September 2026**. Report due: **28 September 2026**.
Release-candidate review: **29 September**. Intended launch: **30 September 2026**.
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
| J-Staff | Existing dashboard panels respect permissions, isolate failure and link to working tasks | Inspect public-feed counting limits; duty/approvals changes owned by the separate HR workstream |
| J-Forecast | Save/reopen, preview, publish, correct and expire; draft edits preserve published snapshot | Connected browser-to-public verification pending |
| J-CMS | Publish editorial content and verify its intended public location and freshness | Source mapping and measured update delay pending |
| J-CAP | Validate, submit/review/approve as required, publish, update/cancel; verify intended feeds | Existing lifecycle plus new administration gaps; browser verification pending |
| J-WxWatch | Enabled sources show provenance, age, stale/missing states and recovery | Source/archive/API baseline in progress; connected recovery pending |
| J-Obs | Save/reopen and validate staff records; keep imported observations separate; identify unaccepted lifecycle capabilities | API currently lists, creates and performs limited SYNOP validation; encoding, finalisation and corrections are not accepted |
| J-SYNOP | Trace an observation through SURFACE to a retrievable BUFR artifact and matching WIS2 notification | Sandbox integration pending; no production cutover authorised by this record |
| J-Aviation | Encode and validate TAC/IWXXM; distinguish manual submission, automated submission and receiver acceptance | Converter, profile and transport selection pending |
| J-HR | Complete chosen staff/approver tasks with persistent state and enforced permissions | Select and verify tasks using controlled test records |
| J-Competence | Maintain training/qualification evidence and expiry; unknown is not current; enforce permissions | Separate HR agent owns implementation and evidence; no automatic duty eligibility rules |
| J-Docs | Find guides through navigation/search and follow links on desktop/mobile | Documentation hub implementation and checks pending |
| J-Clean | Assign dated work, start/complete/block, reassign and verify with history | Active bounded pilot; schema/contract approval required; release after acceptance |
| J-Quality | Identify approved document revisions; own findings/actions and evidence; review, close and reopen | Active bounded pilot; document findings register available; backend approval required |

For each scenario record date, revision/dirty-worktree scope, environment, test
record identifiers, steps, expected result, actual result, evidence, remaining
defects and acceptance owner. Record automated verification, staff acceptance
and deployment verification separately. Unassigned owners block acceptance.
Unit tests alone do not mark a connected journey passed.

## Delivery batches

1. Evidence inventory and journey record.
2. Documentation hub: preserve all URLs and hurricane material; replace fictional API guides.
3. Public website design and CMS/forecast/CAP integration.
4. CAP administration within actual API capabilities.
5. eRegister lifecycle and imported-observation view.
6. SURFACE/WIS2 sandbox handoff using the existing publisher.
7. Aviation conversion, validation and submission tracking.
8. Additional HR/account actions, release checks and audience-specific reports.

Five active products: GAA Staff, GrenMet Operations, GAA People, GAA Clean and
GAA Quality. People/HR and competence are being implemented by another model;
this workstream must preserve those concurrent changes. Clean and Quality are
active builds with acceptance-based release, without a September 30 commitment.
Bus, salesbus, Stores, IT Tickets, Resources, wider airport Operations, external
passenger services and expanded climate/commercial services remain deferred.
Preserve their pages/navigation with accurate status. Clean excludes offline
sync, separate PWA packaging, QR scanning, inventory and general maintenance.

## Decisions and external dependencies

- Aviation receiving interface, profile and acceptance evidence remain unresolved.
  Validated downloads and manually recorded submissions must not imply receipt.
- Verify and pin an IWXXM release against receiver requirements; do not assume
  an older version is the latest.
- Follow ADR-0010: SURFACE owns WIS2 publication; wis2box performs conversion.
  Select the supported ingestion interface after inspecting existing contracts.
- Operational acceptance owners remain to be named by Eugine.
- Mandatory sandbox target: traceable WIS2 BUFR artifact, matching notification
  and retrieval, plus aviation file generation and all required validation stages.
  Missing evidence means the September 30 scope is not fully accepted. Eugine
  must explicitly decide hold or reduced release; there is no automatic downgrade.
  Aviation receiver acceptance additionally requires a named receiver/profile,
  authorised access and actual receipt evidence. Preserve existing operational
  submission procedures until replacements pass acceptance.
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

## Revised delivery references — 23 September

- [Programme execution plan](../portfolio/gaa-gms-september-delivery.md): scope,
  dates, backlog references and release decisions; this file remains the single
  journey evidence ledger.
- [Pilot and CMS schema proposals](../products/gaa-clean-quality-cms-proposals.md):
  reviewable approval boundary, no migration or new backend mutation implemented.
- [Quality findings register](launch-findings.md): defects, response and review
  history; it does not duplicate journey acceptance statuses.

### Reproduced baseline and publishing assessment

Revision `e4316039ae8e0ae64da3988cae51dda10d6fbcff`, devcontainer, 23 September.
Controlled automated fixtures only; no operational messages issued. Acceptance
owners unassigned. Staff acceptance and deployment verification remain pending.

- Fresh `pnpm exec turbo run test --force --filter=@barrelsgd/web-gms
  --filter=@barrelsgd/web-cms --filter=@barrelsgd/web-auth` passed. GMS: 154 tests.
  Full command output: `/tmp/programme-baseline-fresh.log` (session-local evidence).
- Host connectivity: API 8000, Postgres 5432 and Redis 6379 reachable;
  web ports 3000/3001/3002/3003/3006 unreachable, including outside the sandbox.
  Browser connected journeys cannot yet be accepted from this environment.
- Host-backed `pytest tests/wxproducts tests/cap tests/wxwatch -n 4 --dist load -q`
  using the documented host connection and disposable test databases: 203 passed,
  three connection-timeout failures, 43 warnings, 121.04 seconds. Log:
  `/tmp/programme-api-baseline.log`. This is a partial pass, not a clean suite.
- Publishing regressions: three failing assertions reproduced incorrect
  publications placement and stripping of LOCAL TEST labels. Log:
  `/tmp/publishing-red.log`. Fixes also remove sample-article substitution and
  distinguish CMS outage from a missing/unpublished article. Final verification
  follows below.
- CMS source mapping: `latest-from-us` → homepage Latest from us;
  `weather-news` → Weather News; `latest-publications` → Latest publications
  and `/news`. Individual published articles use `/news/[...slug]`.
  Operational forecasts come from FastAPI public wxproducts snapshots; CAP
  warnings come from the public warning API. CMS is not the forecast store.
  CMS fetches use `no-store`; measured end-to-end refresh delay remains pending.
- Staff dashboard product counts use the current public product feed, not an
  issue history. They cannot prove completion of every scheduled daily issue.
  Keep the scheduled issue ledger F06 as an explicit acceptance gap.
- SURFACE inspection found `/wx/data/manual-import/check/` and
  `/wx/data/manual-import/upload-files/`, mapped to `manual-data-import:write`.
  Check stages files; upload queues `ingest_manual_station_files` and returns
  202. That response is queued, not decoded, BUFR-generated or received.
  The shared staging directory requires an isolated operator sandbox exercise.
  Station/decoder mapping, archive values, existing publisher output and receipt
  must be verified before selecting this as the eRegister handoff.

### Verified implementation results

All results below are automated engineering evidence on the working diff over
`e4316039`, not staff acceptance or deployment verification. Test records use
synthetic example.test users, controlled product fixtures and randomly named
disposable databases/schemas; no operational records or external channels used.

| Journey / scenario | Steps and expected result | Actual result / evidence | Remaining acceptance |
| --- | --- | --- | --- |
| J-CMS placement, outage and absent article | GMS suite: publications request own section; unavailable CMS shows notice; absent/sample slug returns not found | 158 tests pass; `/tmp/publishing-green.log`; new page tests plus feed/component regressions | Browser edit→publish→public, image/document rendering, measured freshness, owner |
| J-CMS private draft/review/publish | CMS suite with `CMS_TEST_DATABASE_URL` using isolated schema; author cannot publish or modify others; public cannot read drafts/history | 25 tests pass, zero skips; `/tmp/programme-cms-db.log`; fixtures repaired to use runtime rich text and permissions | Staff acceptance and deployed storage/media privacy |
| J-Staff truthful product status | Admin suite: source failure isolated; all four product types do not imply daily issue completion | 353 tests pass across 76 files; `/tmp/programme-admin.log` | Browser role checks, F06 scheduled issue history; HR owner handles duty/approvals |
| J-CAP/J-WxWatch/J-Forecast API baseline | Host disposable databases; existing lifecycle, feed, authoring/archive scenarios | 203 passed initially; three database connection timeouts all passed on serial retry in 11.65s; `/tmp/programme-api-retry.log` | Not a single clean full-suite run; browser/receiver/staff checks still pending |
| J-Obs save/reopen | POST nested workbook plus optional artifact metadata, GET it back, verify UTC, draft and anonymous denial | Reproduced driver failure, corrected native datetime/JSONB bindings; two tests pass; `/tmp/eregister-red.log`, `/tmp/eregister-green.log` | Station permissions, full validation/lifecycle and sandbox handoff still unaccepted |
| API contract/persistence checks | eRegister plus OpenAPI and datetime guard tests; focused mypy; regenerate spec/client and check drift | 13 tests pass; mypy passes eight files; drift passes with no generated contract delta | Proposed strict input/output schema changes await approval |
| J-Docs structure | Documentation tests and draft guidance update | 20 tests pass; `/tmp/programme-docs.log` | Browser/mobile/search and owner acceptance |

Workspace type-check passed 16/16. `pnpm fix:changed`, focused Ruff checks and
staged guardrails passed. No changes staged by this agent, so staged guardrails
alone do not assess the working diff; consumer searches and focused regression
tests supply the affected-layer verification. Concurrent HR/audit/notification
work is owned by the other model and excluded from these implementation claims.

The [schema review](../api/schema-review-2026-09-23.md) records reproduced CAP,
eRegister, public product and account-security contract weaknesses, distinguishes
service-layer validation from schema acceptance, and proposes an observation
lifecycle. [Aviation evaluation](aviation-converter-evaluation.md) records the
candidate and remaining runtime/profile/dependency gates. Report/recovery drafts:
[September 28 report](gm-readiness-report-2026-09-28.md),
[launch/recovery checklist](september-launch-recovery.md).

GMS and docs production builds passed (2m31s combined Turbo run). Documentation
links passed. Portfolio check exposed the missing existing `scripts/audit`
governance entry; the delivery map now includes it. Browser verification remains
pending despite successful builds. Post-launch reporting is prepared as a
[template and prioritised backlog](post-launch-review.md), not a claimed outcome.

### Approved contract corrections — September 23

User approval to continue covered the bounded CAP/eRegister input and public
timestamp corrections from the schema review. No migration or dependency was
added. Historical read DTOs remain compatible; new CAP timestamps and observation
timestamps require explicit offsets. Observation station IDs are trimmed and
cannot be blank, and unknown observation envelope fields are rejected. Public
product and account-session timestamps serialize as UTC with `Z`.

Evidence is on the working diff over `e4316039`, in the devcontainer against
host-published services using disposable test databases and synthetic records.
Acceptance owners remain unassigned; these results do not establish staff or
deployment acceptance.

| Journey / scenario | Steps and expected result | Actual result / evidence | Remaining acceptance |
| --- | --- | --- | --- |
| J-CAP timestamp validation and duplication | Reject mixed/naive input with 422; reject timezone-less imported XML; duplicate saved alert without changing its information times | Broad non-HR API run: 219 passed, one incorrect new test expectation (201 instead of existing 200); corrected expectation and focused retry passed. `/tmp/contracts-api.log`, `/tmp/contracts-focused-retry.log` | Staff/import exercise and owner |
| J-Obs strict input and persistence | Reject blank station, unknown fields and naive timestamps before persistence; trim station; save/reopen valid observation | Eight focused tests pass across CAP and observation persistence, including final trimmed-station round trip; 13 schema regression tests pass. `/tmp/contracts-focused-retry.log`, `/tmp/contracts-green.log` | Full lifecycle, station permissions and sandbox handoff |
| J-Forecast / J-Access public timestamps | Validate product dates; serialize stored session times as UTC; preserve existing internal timestamp consumers | Product/auth tests included in 219 passing API tests; scoped mypy passes 45 source files; OpenAPI/client regenerated and drift passes. `/tmp/contracts-mypy.log`, `/tmp/contracts-drift.log` | Connected browser and acceptance-owner checks |

API-client tests (10) and GMS tests (158) pass in the serial frontend run.
The remaining frontend run was interrupted by a container restart, following a
CAP composer test failure under load; targeted consumer verification is recorded
below when complete. These partial runs are not a clean full workspace suite.

Required workspace checks were run. At that checkpoint formatting was blocked by
`record-history.tsx`'s inline regular expression, and type-check by
`notification-list.tsx` passing `{}` to a void mutation. Both files belong to
concurrent audit/notification work and were left to its owner. The previous
16/16 result above describes the earlier batch only. Scoped Ruff, API drift,
staged guardrails and diff whitespace checks passed. No commits or deployments.

Final required-check rerun: type-check passed 15/16 tasks and still failed on
the same notification mutation argument. Formatting reported 13 errors and
three warnings across concurrent auth, audit, HR notification-settings and
notification tests/components. Logs: `/tmp/contracts-types-final.log` and
`/tmp/contracts-format-final.log`. These unresolved checks prevent a claim of
workspace-wide readiness; no HR or notification behavior was changed here.

Targeted CAP frontend retry finished: 12 passed, one catalogue-rendering test
timed out at the per-run 20-second limit (no repository timeout change).
Both API/query consumer test files passed; the composer file passed six of
seven tests. Log: `/tmp/contracts-admin-focused.log`. A clean composer rerun
remains required; load-related timing is suspected, not an accepted explanation
for waiving the failed check. No browser or full-admin acceptance is claimed.

Follow-up at 15:50 UTC: the isolated CAP composer rerun passed all seven tests
in 39.58 seconds (`/tmp/cap-composer-final-retry.log`), closing that targeted
verification gap without changing the component or its tests. Workspace checks
still fail: eight lint errors in concurrent work and the same notification
mutation type error (15/16 tasks pass). Logs: `/tmp/cms-next-format.log`,
`/tmp/cms-next-types.log`. CMS product-link implementation is awaiting the
withdrawn-content disclosure decision requested from the user; inspection
confirmed usable published revision history and migration-only Payload setup.

### J-CMS editorial sections and product links — September 23 follow-up

User clarified and approved manual editorial links to existing destinations,
superseding the proposed public historical-revision endpoint for this slice.
Latest from us now offers Tropical weather outlook, Bulletin, Forecasts, Marine,
Aviation and CAP alerts, retaining existing saved general categories. Weather
news and Latest publications retain their separate purposes and categories.
Optional related links have a title, category and unique HTTP/HTTPS destination;
links do not publish operational products or promise a fixed historical snapshot.
Public articles display their actual section/category and the related links.

Revision/environment: working diff over `e4316039`, devcontainer; synthetic CMS
users and posts in a random disposable host-Postgres schema. Test setup replaces
auto-created link tables with migration `20260923_170000_editorial_links`, then
checks draft privacy, publication permissions, saving/reopening links, version
history and link removal. Unsafe, malformed and duplicate destinations are
rejected. Older posts require no relationship backfill. Payload types regenerated.

Automated evidence: CMS 34/34 tests (including database integration) pass;
GMS 159/159 tests pass, then final article/feed consumer rerun 10/10 passes.
`pnpm fix:changed`, workspace type-check 16/16, staged guardrails and whitespace
checks pass. Logs: `/tmp/cms-links-test.log`, `/tmp/cms-links-gms.log`,
`/tmp/cms-links-final-consumers.log`, `/tmp/cms-links-format-final.log`,
`/tmp/cms-links-check-final.log`, `/tmp/cms-links-guardrails.log`.

Rollout limitation: apply the CMS migration before deploying this code. No
operational migration, commit or deployment was performed. Destructive rollback
is blocked to preserve publication history; retain a pre-migration backup.
Host ports 3003/3006 are unreachable even outside the sandbox, so connected
browser and staff acceptance remain pending. Acceptance owner is unassigned.
Historical publication identity/PDF linking and withdrawal disclosure remain
deferred; ordinary links leave destination access under its existing controls.

CMS and GMS production builds both passed (3/3 Turbo tasks, 6m30s);
`/tmp/cms-links-build.log`. This is build verification only, not deployment.
