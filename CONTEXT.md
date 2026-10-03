# GMS Weather Products & Services

Vocabulary for how Grenada Meteorological Service (GMS) products, hazard bulletins,
and CAP alerts relate — reconciling the codebase's flat `PRODUCT_KINDS` list
(`packages/gms/src/products.ts`) with WMO service categories and Impact-Based
Forecasting (IBF) practice.

## Language

**Scheduled Product**:
A product issued on a fixed, recurring time regardless of whether a hazard is
present — Morning/Midday/Evening Forecast, Tropical Weather Outlook, and Marine
Bulletin. Identified in code by having an entry in `ISSUE_TIMES`.
_Avoid_: routine forecast, PWS product (ambiguous on its own — see Service Categories)

**Hazard Bulletin**:
A product issued only when a specific hazard is active or expected, not on a
fixed schedule — Cyclone, Flood, Thunderstorm, Wind, Heat, Dust, Coastal,
Tsunami. Has no `ISSUE_TIMES` entry.
_Avoid_: warning (that's the CAP Alert, not the bulletin), advisory (a `notice`
value *within* a bulletin, not the bulletin type itself)

**CAP Alert**:
The standardized, machine-readable alerting message (WMO/ITU Common Alerting
Protocol v1.2) escalated from a Scheduled Product or Hazard Bulletin once its
IBF assessment crosses the Warning Threshold. Not an authored product in its
own right — it is a derived artifact with its own lifecycle (draft → submitted
→ approved → published → expired → cancelled, per ADR-0007) and its own risk
vocabulary (Severity/Urgency/Certainty), separate from the source bulletin's
Likelihood/Impact/Response.
_Avoid_: warning, alert bulletin, CAP product

**Likelihood / Impact / Response**:
The IBF assessment vocabulary carried on Scheduled Products and Hazard
Bulletins, used to judge hazard severity before a CAP Alert is considered.
Likelihood: Very low / Low / Medium / High. Impact: Minimal / Minor /
Significant / Severe.
_Avoid_: severity — that's CAP's term, and only applies once a CAP Alert exists

**Severity / Urgency / Certainty**:
CAP's own risk vocabulary, set only on a CAP Alert. Severity: Unknown / Minor /
Moderate / Severe / Extreme. Urgency: Unknown / Past / Future / Expected /
Immediate. Certainty: Unknown / Unlikely / Possible / Likely / Observed.
_Avoid_: likelihood, impact level — those belong to the source bulletin's IBF
assessment, not the CAP Alert

**Warning Threshold**:
The decision point at which a Scheduled Product's or Hazard Bulletin's IBF
assessment gets escalated into a CAP Alert. Not currently codified — left to
forecaster judgment. (Open question — see below.)

## Service Categories (recommended, WMO-aligned)

- **Public Weather Service (PWS)** — Morning/Midday/Evening Forecast, Tropical
  Weather Outlook, Marine Bulletin. Marine Bulletin is grouped here, not with
  the Hazard Bulletins, because it's schedule-driven (05:00 daily, issues even
  on a Green/no-action day) rather than hazard-triggered.
- **Disaster Risk Reduction / Early Warning (MHEWS)** — the 8 Hazard Bulletins
  (Cyclone, Flood, Thunderstorm, Wind, Heat, Dust, Coastal, Tsunami) plus the
  CAP Alert escalation path out of any Scheduled Product or Hazard Bulletin.
- **Aviation Meteorological Service (AeMS)** — TAF (`wxproducts/aviation`),
  METAR/SPECI (e-register).
- **Observation / Climate Data Service** — Hourly observations, SYNOP logging
  (e-register), NHC imagery ingestion (wxwatch). Feeds the categories above;
  not itself an authored public product.

**Publishing Lifecycle** (target state, decided — supersedes today's split):
One shared state machine for every product, CAP Alert included: Draft
(accumulating revisions) → Published (self-published by the author, no
mandatory approval gate) → Withdraw/Cancel. This retires CAP's separate
Submitted/Approved gate (ADR-0007's current model) in favour of the same
self-publish shape ordinary bulletins already use.
_Avoid_: approved, submitted — no longer states in this model once ADR-0007 is
superseded (see Open questions)

**Review**:
An optional, non-blocking look another person can give a Draft *before* it
publishes. Available on request, never required — the author can always
publish without it. Distinct from the old CAP "Approve" step, which blocked
publish; Review never blocks.
_Avoid_: approve, approval — those imply a required gate, which this isn't

**Linkage** (what connects these products — current code state, then target):
- **Real today**: CAP Alert → PWS forecast (Morning/Midday/Evening only).
  `CapForecastPicker` copies a *published, Actual* CAP Alert's
  headline/description/instruction into the forecast's `summary` (or a
  `dayNWeather` field on Evening), tagged with the CAP identifier.
- **Target**: extend that same picker so Marine Bulletin, Tropical Weather
  Outlook, and all 8 Hazard Bulletins can pull in current CAP text too — not
  just the 3 general forecasts. (`isForecastKind` today excludes Outlook the
  same way it excludes Marine and the Hazard Bulletins.)
- **Hazard Bulletin → CAP Alert (decided: manual convention, no schema
  change)**: when a bulletin escalates to a CAP Alert, write the bulletin's
  product ID and revision into the CAP Alert's existing free-text `note`
  field. Not queryable or enforced — a documented convention, not a database
  relationship.
- **Lifecycle coupling (decided, split by source category)**: withdrawing the
  source bulletin always cascades to cancelling its linked CAP Alert. The
  reverse depends on what kind of product the CAP Alert came from:
  - **PWS-sourced** (Marine Bulletin, a general forecast): cancelling/expiring
    the CAP Alert does **not** withdraw the source — it's a valid scheduled
    record regardless of whether the hazard it flagged is still live.
  - **Hazard-Bulletin-sourced** (Cyclone, Flood, etc.): cancelling/expiring
    the CAP Alert **does** withdraw the source bulletin — an event-triggered
    bulletin has no standing reason to stay public once the hazard it existed
    for has been called off.
  Publishing stays two independent actions either way: publishing the
  bulletin does **not** auto-publish its CAP Alert, and vice versa — a
  forecaster clicks Publish on each separately, possibly minutes apart.

**Warning Threshold** (decided: modular, not a hard gate):
No single system-enforced rule for when a bulletin's IBF assessment escalates
to a CAP Alert. Instead, a per-hazard-category advisory table (cyclone's
threshold looks nothing like heat's) that guides — but never blocks — the
forecaster's judgment call. Default posture where no table exists yet: pure
judgment, same as today.

**Dissemination**:
How a Published product or CAP Alert reaches the public GMS website
(`apps/web/gms`) — verified in code, and currently **two separate channels**,
not one:
- **Product feed**: `fetchPublishedProducts` (`apps/web/gms/src/lib/products.ts`)
  reads FastAPI's public products endpoint and renders per-kind pages (e.g.
  `/marine/forecast` → `<PublishedProducts kinds={["marine"]} />`), each issue
  linking to `/products/issued/{id}`. Covers every PWS product and every
  Hazard Bulletin — Published, currently valid, non-withdrawn only; a feed
  outage renders "cannot be retrieved," never a silent empty list.
- **CAP warnings feed**: `fetchActiveAlerts` (`apps/web/gms/src/lib/cap.ts`)
  reads `${CAP_API_URL}/api/cap/warnings` directly (a distinct public CAP
  endpoint) and drives `/warnings`, `/warnings/cyclone`, `/warnings/marine`,
  `/warnings/tsunami`, `/marine/small-craft`, and the site-wide alerts panel
  (severity picks the banner level: Extreme/Severe → take-action, Moderate →
  be-prepared, else be-aware). Same "outage ≠ all-clear" rule.
- These two feeds are **documented as deliberately decoupled today**:
  `docs/operations/gms-products.md` states outright — "CAP is independent.
  These bulletins do not create CAP messages, synchronize their statuses or
  contribute to CAP warning counts. Linking is deferred." Every linkage
  decision resolved above (manual `note` back-reference, cascading
  withdraw/cancel, CAP fan-out into bulletins) reverses that deferral and
  needs to be reconciled with this doc, not just with ADR-0007.

**Hazard Bulletin Kind** (decided — no collapse):
The 8 event-triggered Hazard Bulletins stay distinct `ProductKind`s in code
(Cyclone, Flood, Thunderstorm, Wind, Heat, Dust, Coastal, Tsunami), not one
kind parameterized by hazard type. Heat alone has a materially different
field shape (a heat-health assessment block: consecutive days, night
recovery, thresholds) that a generic collapse would either bloat everyone
else with or lose. `Hazard Bulletin` stays a **domain/service-category
grouping** (this glossary, `CONTEXT.md`) rather than a forced code merge —
the same relationship PWS already has to its 5 distinct kinds.

More kinds are expected over time. "Modular" here means: adding a 9th kind
is a small, contained addition (a new `BULLETIN_CATEGORIES` entry + a new
`hazardDetails[kind]` field list, an `ISSUE_TIMES` entry only if it turns out
to be schedule-driven) — not a schema migration across every existing kind.
That's already the shape of the code today; the decision is to keep adding
this way rather than generalizing it away.

**CAP Hazard Taxonomy** (reference for future additions):
`apps/web/gaa-admin/src/lib/cap-hazards.ts` already defines 29 hazard groups
for CAP authoring (`CAP_HAZARD_GROUPS`), spanning categories far beyond what
GMS bulletins cover today — Met and Geo (Tsunami, but also Earthquake,
Landslide, and Volcanic Activity, which names Kick-'em-Jenny explicitly),
plus Fire, Health, Env, Infra, Transport, Safety, Security, Rescue, CBRNE.
Only ~7 of the 8 current Hazard Bulletin kinds have a matching CAP_HAZARD_GROUPS
entry (Thunderstorm and Wind share one CAP group; Marine's group covers the
now-PWS Marine Bulletin, not a Hazard Bulletin). Any new Hazard Bulletin kind
should take its `event`/category naming from this existing list rather than
inventing parallel vocabulary — CAP is the broader, already-built taxonomy;
GMS bulletins are presently a subset of it.

## Open questions

- **Volcanic Activity, Landslide, and Earthquake already have CAP event
  vocabulary (`cap-hazards.ts`) but no GMS Hazard Bulletin kind.** Kick-'em-
  Jenny alone makes Volcanic Activity a plausible near-term addition for
  Grenada specifically. Before adding any of these: is GMS the issuing
  authority for geophysical hazards, or does it only relay/co-publish from
  another body (e.g. the Seismic Research Centre, NaDMA)? That answer
  decides whether these become GMS-authored Hazard Bulletins at all.
- Per-hazard Warning Threshold tables (cyclone, marine, heat, etc.) don't exist
  yet — need to be drafted per hazard category before the modular framework
  has any real content.
