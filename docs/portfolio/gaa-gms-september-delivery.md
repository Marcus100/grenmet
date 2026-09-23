# GAA/GMS September delivery plan

Effective 23 September 2026. This amends September sequencing in the
[client programme plan](gaa-gms-client-programme-plan.md), preserving original
memoranda and the [F/E backlog](../internal/gms-product-strategy-and-roadmap.md).
The [readiness ledger](../operations/launch-readiness-coverage.md) is the only
journey acceptance/status record.

## Active scope

| Product | Delivery scope | Evidence |
| --- | --- | --- |
| GAA Staff | Existing operations dashboard, truthful source state and working task links | J-Access, J-Staff |
| GrenMet Operations | Public/CMS publication, Forecast Studio, CAP, WxWatch, staff/imported observations, WIS2 sandbox and aviation validation | J-CMS, J-Forecast, J-CAP, J-WxWatch, J-Obs, J-SYNOP, J-Aviation, J-Docs |
| GAA People | Profile/directory, roster, leave, exchanges and competence; another model owns this work | J-HR, J-Competence |
| GAA Clean | Assignment-to-completion phone pilot; release after acceptance | J-Clean |
| GAA Quality | Document control and findings/actions pilot; release after acceptance | J-Quality |

Defer Bus/salesbus, Stores, IT Tickets, Resources, wider airport Operations,
external passenger services and expanded climate/commercial services. Existing
navigation stays available with accurate status. No automated duty eligibility,
payroll, timesheet expansion or workforce forecasting in this tranche.

## Sequence and safeguards

1. September 23–24: reconcile the ledger, exact routes/kinds, baseline tests,
   owners, restore/monitoring readiness and sandbox dependencies.
2. September 24–26: fix and verify publishing and Staff journeys; progress
   mandatory sandbox proof. People proceeds independently. Submit exact
   Clean/Quality schema, permission, API and migration proposals before coding
   mutations; CMS product references also need schema approval.
3. September 26–27: staging positive/negative permission journeys, outages,
   recovery and schema-compatible rollback. Clean/Quality cannot displace
   essential launch fixes.
4. September 28: dated GM readiness report, guidance, evidence and recovery pack.
   A draft prepared earlier must retain its actual evidence cutoff.
5. September 29: staff walkthrough and release-candidate review of an exact
   revision. Only necessary fixes enter afterwards, with affected re-verification.
6. September 30: Eugine deploys accepted scope and records post-deployment
   outcomes. Agent performs no commit, push, merge or deployment.
7. After launch: dated adoption/progress report and prioritised remaining backlog;
   release Clean and Quality only after acceptance.

Backlog continuity: F01–F03 register/standards/recovery; F06–F14 operations and
publication; F15–F18 observations; F20–F25 aviation; F32–F33 guidance/evidence.
These references preserve their existing acceptance criteria and E extensions.

Access-control failure, unsafe publication, data loss or failed essential
recovery blocks the affected release. Missing mandatory WIS2 or aviation
validation evidence requires an explicit hold/reduced-release decision by
Eugine. Receiver testing is pursued separately and never inferred from files.
No owner is invented and no date converts unverified work into acceptance.

## Reviewable engineering gates

See [schema proposals](../products/gaa-clean-quality-cms-proposals.md). No new
dependency, shared-package abstraction, migration or API lifecycle contract is
authorised merely by recording a proposal. Preserve accepted manual aviation
submission and ADR-0010's single SURFACE publisher. Staff and restricted records
must not become public by linking them from CMS or documentation.
