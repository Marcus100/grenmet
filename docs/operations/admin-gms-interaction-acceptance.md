# GAA admin and GMS interaction acceptance

**Status:** Active reference  
**Owner:** GMS (operational content); maintained by Barrels Grenada  
**Last updated:** 2026-09-29

This inventory covers every current page route and the distinct interaction
families below. Route discovery is not browser verification. An exhaustive proof
of every input combination is impossible; acceptance covers permissions, state
transitions, boundaries, failures and responsive presentation for each family.

## Environments and evidence

- Local: use isolated test databases for mutations and failures.
- Staging: start with read-only browsing. Use labelled records and sandbox
  providers for later mutation acceptance; never transmit real CAP alerts or
  perform live payments as a navigation test.
- Production: no mutation or deployment acceptance in this change.
- Browser execution is currently blocked in the agent container: installed Chrome
  cannot load libatk-1.0.so.0. Existing screenshots and unit tests do not replace
  browser acceptance. Run the checklist on the host or a provisioned browser runner.

## Current implementation follow-ups

- New submissions through `start_workflow_for_entity` now reject missing active
  templates. Drafts may be saved before template setup; existing pre-workflow
  requests remain readable and actionable. Verify this distinction in staging.
- Partial account-creation failure recovery and incomplete staff saves now have
  UI regressions. Verify the full admin browser flow, including reload and retries.
- Backend verification used a broad HR/CAP/auth/onboarding run followed by
  targeted reruns. The final selection had 183 passes; its one legacy-fixture
  failure passed after correction. The admin suite passed 267 tests in 48 files.
  These automated checks do not replace staging browser acceptance.
- Browser, PDF, staging identity and external-provider acceptance remain pending.

## Required interaction families

| Area | Actions and states to exercise | Evidence required |
| --- | --- | --- |
| Shared shell | Sidebar, nested menus, command search, breadcrumbs, keyboard focus, Escape, mobile drawer, direct URLs and browser back | Browser at 375, 390, 768, 1024 and 1440 pixels |
| Identity | Sign in, invalid credentials, verification required, pending approval, session expiry, logout, logout-all, public proxy origin | Auth/API regressions plus signed-in browser |
| Staff | Existing account search, account creation, partial failure recovery, role assignment, personal/contact/address edits | User tests plus browser and saved record reload |
| HR Setup | Missing/disabled grades, preview/import, conflicts, repeat import, partial staff details, account disabling, supervisor validation, grade/policy edits | Catalogue/API and UI tests plus browser |
| Permissions | Superuser, active allowed grade, denied grade, other department, inactive account/grade, revoked credential, pending approval | API tests and separate browser identities |
| Dashboard/calendar | Loading, unavailable data, empty lists, filters, refresh interval, event creation/edit/cancel, date navigation, roster and holiday sources | Dashboard/calendar tests and browser |
| Rosters | Shift setup, date boundaries, draft edits/discard/save, import validation/errors, publication, closure, revisions | API and roster UI tests plus browser |
| HR requests | Every form: incomplete draft, reload, edit/delete, submit, approver inbox, approve/reject, status/ledger refresh, printing | HR/API/UI tests plus multi-account browser |
| Approval safety | Missing policy, self-approval denial, distinct approvers, unavailable approver, duplicate action, policy changes preserve active requests | API regressions and staged acceptance |
| Authored products | All 13 forms: draft, validation, preview confirmation, publish, concurrent edit, revise while snapshot stays public, expiry, withdrawal, attribution | Product/API tests plus editor-to-public browser |
| Public GMS products | Nine hazard destinations, forecast/outlook/marine feeds, empty versus unavailable state, current snapshots only, invalid kind | GMS/admin tests plus public browser |
| CAP | Compose, validate, submit, approve, publish/cancel/expire, duplicate/import, audit, public JSON/XML/RSS; missing policies | CAP tests; external dissemination requires sandbox configuration |
| WXWatch | Date controls, unavailable/empty slots, gallery image/lightbox, keyboard close, archive URLs | Gallery tests plus browser; collectors remain local |
| Aviation/wxRegister | Composer edits, local draft persistence, preview/print; distinguish prototypes from transmitted observations | Browser; do not claim automated transmission |
| Bus/janitorial/stores/services | Inspect each available action, persistence boundary, permissions, error state and navigation; identify mock or planned controls | Source review and browser; no false claim of live transactions |
| Public content | Images, dynamic slugs, missing pages, links, sharing/copy, archive/date navigation, subscription/contact forms where implemented | Content tests and browser; email requires sandbox |
| PDFs | All preview entry points, long documents, page breaks, fonts, clipping, response guidance, marine wording | Printed/exported artifact inspection |
| Integrations | API origins, CAP, storage, mail, Sentry, PostHog, Stripe: missing configuration, isolation, timeout and provider acceptance | Configuration tests plus environment-specific provider evidence |
| Database startup | Fresh schema, existing records, duplicate identity, missing catalogue, repeated repair, backup/restore and compatible-image rollback | Isolated DB tests and deployment logs; restore rehearsal pending |

## Page route inventory

Each route still requires the applicable interaction-family checks above. Dynamic
segments need both valid and missing-record examples. A page that displays a
placeholder is not an implemented service.

| App | Route | Browser acceptance |
| --- | --- | --- |
| gaa-admin | `/calendar` | Pending |
| gaa-admin | `/profile` | Pending |
| gaa-admin | `/bus` | Pending |
| gaa-admin | `/cap/admin/new` | Pending |
| gaa-admin | `/cap/alerts/[identifier]` | Pending |
| gaa-admin | `/cap` | Pending |
| gaa-admin | `/climate` | Pending |
| gaa-admin | `/coming-soon` | Pending |
| gaa-admin | `/hr/absentee` | Pending |
| gaa-admin | `/hr/approvals` | Pending |
| gaa-admin | `/hr/forms` | Pending |
| gaa-admin | `/hr/leave` | Pending |
| gaa-admin | `/hr` | Pending |
| gaa-admin | `/hr/reports` | Pending |
| gaa-admin | `/hr/shift` | Pending |
| gaa-admin | `/hr/status` | Pending |
| gaa-admin | `/hr/timesheet` | Pending |
| gaa-admin | `/hr-setup` | Pending |
| gaa-admin | `/it-tickets` | Pending |
| gaa-admin | `/janitor` | Pending |
| gaa-admin | `/` | Pending |
| gaa-admin | `/resources` | Pending |
| gaa-admin | `/roster` | Pending |
| gaa-admin | `/salesbus/inventory/[category]` | Pending |
| gaa-admin | `/salesbus/inventory` | Pending |
| gaa-admin | `/salesbus` | Pending |
| gaa-admin | `/salesbus/sales/cart` | Pending |
| gaa-admin | `/salesbus/sales` | Pending |
| gaa-admin | `/salesbus/settlements/customers/[id]` | Pending |
| gaa-admin | `/salesbus/settlements/customers` | Pending |
| gaa-admin | `/salesbus/settlements` | Pending |
| gaa-admin | `/salesbus/settlements/transactions` | Pending |
| gaa-admin | `/users` | Pending |
| gaa-admin | `/wxproducts/aviation` | Pending |
| gaa-admin | `/wxproducts/bulletins/marine` | Pending |
| gaa-admin | `/wxproducts/bulletins` | Pending |
| gaa-admin | `/wxproducts/fcsts` | Pending |
| gaa-admin | `/wxproducts/hourly` | Pending |
| gaa-admin | `/wxproducts/nhc` | Pending |
| gaa-admin | `/wxproducts` | Pending |
| gaa-admin | `/wxwatch/[year]/[month]/[day]` | Pending |
| gaa-admin | `/wxwatch` | Pending |
| gaa-admin | `/signin` | Pending |
| gms | `/[...planned]` | Pending |
| gms | `/about` | Pending |
| gms | `/about/careers` | Pending |
| gms | `/about/contact` | Pending |
| gms | `/about/history` | Pending |
| gms | `/about/network` | Pending |
| gms | `/about/regional` | Pending |
| gms | `/about/services` | Pending |
| gms | `/about/standards` | Pending |
| gms | `/accessibility` | Pending |
| gms | `/app-guide` | Pending |
| gms | `/climate` | Pending |
| gms | `/climate/archive` | Pending |
| gms | `/climate/data-request` | Pending |
| gms | `/climate/drought` | Pending |
| gms | `/climate/historical` | Pending |
| gms | `/climate/monthly` | Pending |
| gms | `/climate/newsletter` | Pending |
| gms | `/climate/normals` | Pending |
| gms | `/climate/publications` | Pending |
| gms | `/climate/rainfall` | Pending |
| gms | `/climate/seasonal` | Pending |
| gms | `/climate/temperature` | Pending |
| gms | `/disclaimer` | Pending |
| gms | `/explore` | Pending |
| gms | `/explore/downloads` | Pending |
| gms | `/explore/explained` | Pending |
| gms | `/explore/faqs` | Pending |
| gms | `/explore/glossary` | Pending |
| gms | `/explore/hurricane-names` | Pending |
| gms | `/explore/news` | Pending |
| gms | `/explore/news/[...slug]` | Pending |
| gms | `/explore/school` | Pending |
| gms | `/explore/updates` | Pending |
| gms | `/explore/updates/[slug]` | Pending |
| gms | `/help` | Pending |
| gms | `/marine` | Pending |
| gms | `/marine/coastal` | Pending |
| gms | `/marine/forecast` | Pending |
| gms | `/marine/safety` | Pending |
| gms | `/marine/sea-conditions` | Pending |
| gms | `/marine/small-craft` | Pending |
| gms | `/marine/tides` | Pending |
| gms | `/marine/wave-model` | Pending |
| gms | `/marine/wave-swell` | Pending |
| gms | `/privacy` | Pending |
| gms | `/services` | Pending |
| gms | `/services/agriculture` | Pending |
| gms | `/services/aviation` | Pending |
| gms | `/services/aviation/briefing` | Pending |
| gms | `/services/aviation/flight-winds` | Pending |
| gms | `/services/aviation/metar-taf` | Pending |
| gms | `/services/aviation/sigwx` | Pending |
| gms | `/services/construction` | Pending |
| gms | `/services/disaster-management` | Pending |
| gms | `/services/education` | Pending |
| gms | `/services/health` | Pending |
| gms | `/services/media` | Pending |
| gms | `/services/tourism` | Pending |
| gms | `/services/tourism/events` | Pending |
| gms | `/services/tourism/events/[slug]` | Pending |
| gms | `/sitemap` | Pending |
| gms | `/warnings` | Pending |
| gms | `/warnings/[identifier]` | Pending |
| gms | `/warnings/advisories` | Pending |
| gms | `/warnings/bulletins` | Pending |
| gms | `/warnings/bulletins/[hazard]` | Pending |
| gms | `/warnings/cyclone` | Pending |
| gms | `/warnings/cyclone/archive` | Pending |
| gms | `/warnings/exercise` | Pending |
| gms | `/warnings/get-alerts` | Pending |
| gms | `/warnings/impact` | Pending |
| gms | `/warnings/levels` | Pending |
| gms | `/warnings/marine` | Pending |
| gms | `/warnings/prepare/flood` | Pending |
| gms | `/warnings/prepare/hurricane` | Pending |
| gms | `/warnings/tsunami` | Pending |
| gms | `/warnings/understanding` | Pending |
| gms | `/weather/3-day` | Pending |
| gms | `/weather/7-day` | Pending |
| gms | `/weather/analyses` | Pending |
| gms | `/weather/conditions` | Pending |
| gms | `/weather/dust` | Pending |
| gms | `/weather/issued` | Pending |
| gms | `/weather/issued/[id]` | Pending |
| gms | `/weather/models` | Pending |
| gms | `/weather/nowcast` | Pending |
| gms | `/weather/observations` | Pending |
| gms | `/weather/observations/cameras` | Pending |
| gms | `/weather/observations/school-stations` | Pending |
| gms | `/weather/observations/stations` | Pending |
| gms | `/weather/observations/upper-air` | Pending |
| gms | `/weather/observations/water-levels` | Pending |
| gms | `/weather/radar` | Pending |
| gms | `/weather/satellite` | Pending |
| gms | `/weather/sun-and-sky` | Pending |
| gms | `/weather/synopsis` | Pending |
| gms | `/weather/tropics` | Pending |
| gms | `/weather/[year]/[month]/[day]` | Pending |
| gms | `/weather` | Pending |
| gms | `/` | Pending |

GMS routes follow the seven-section Bold sky IA (28 Sep 2026). Old URLs
308-redirect via `apps/web/gms/src/lib/route-moves.ts`; accept a sample of
them. `/[...planned]` serves every nav link marked `planned` as a
sample-content placeholder (list: `plannedPaths()` in
`apps/web/gms/src/lib/nav-sections.ts`).
