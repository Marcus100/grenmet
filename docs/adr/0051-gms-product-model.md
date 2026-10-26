# ADR-0051: GMS product model — green-only GMS alerts, a marine forecast, and tracked tropical systems

## Status

Proposed — 2026-10-23. Amends the bulletin-linkage practice of ADR-0013 (the link
becomes a button that pre-fills a CAP draft). ADR-0023 (CAP approval) is unchanged.

## Context

The owner decided on 23 October 2026 that:

1. GMS alerts (the hazard bulletins) are green only. Yellow, orange and red are
   CAP warnings, which go through the CAP approval workflow.
2. The marine bulletin becomes a fourth regular forecast, the marine forecast,
   issued once a day at 05:00. Marine hazards get their own green marine alerts.
3. The Tropical Weather Outlook moves under Forecasts in the staff desk and on the
   public weather site. Each tropical system has its own form, systems are tracked
   from issue to issue, and National Hurricane Center (NHC) data fills formation
   chances, positions and movement for the forecaster to edit before publishing.
   Scheduled NHC collection is now wanted for the outlook.

Only free and open-source tools and free public data may be used.

## Evidence

- **Facts (high):**
  - Product kinds are free text in `authored_products.kind`; adding kinds needs no
    migration (`src/wxproducts/migrations`).
  - The alert colour is the `level` field, validated against options generated from
    `packages/gms/src/products.ts`; saved revisions are never re-validated.
  - CAP already validates a source link (`GMS:source-bulletin-kind`, `-id`,
    `-revision`) in `src/cap/validation.py`.
  - `ISSUE_HOURS` in `src/wxproducts/validation.py` both fixes forecast slots and
    selects products for the public day-strip forecast.
  - Outlook systems are stored per revision in `guidance.systems`; their ids are
    derived from one NHC edition and do not persist across issues.
  - The collector already fetches NHC `CurrentStorms.json` and the graphical outlook
    map file (`gtwo_atl.kmz`); the NHC worker today only runs operator requests.
- **Interpretation:**
  - A product kind should keep one meaning for every consumer (best practice, high).
  - System identity belongs to GMS and therefore to the wxproducts database; NHC
    source facts stay in WxWatch (best practice, high).
  - The forecaster must remain the actor on every saved revision, so automation
    should prepare suggestions, not write products (heuristic, high).
- **Uncertainty:**
  - Which properties of the NHC map file link a disturbance to its outlook number
    (medium). If none do, position matching covers waves and named storms only.
  - GMS approval of the CAP pre-fill wording (open).

## Options considered

1. **Alert levels.** (a) Keep four colours in GMS alerts and copy to CAP
   automatically on save; (b) green only, with a "Raise to warning" button that
   saves the alert and opens a pre-filled CAP draft (chosen). (a) keeps a level the
   owner removed, adds a side effect to every save and creates duplicate drafts.
2. **Marine products.** (a) Reuse kind `marine` for the forecast; (b) new kinds
   `marine-forecast` and `marine-alert`, with `marine` kept read-only (chosen).
   (a) is smaller but gives one kind two meanings across CAP links, the forecast
   snapshot and the public pages.
3. **System tracking.** (a) Store identity only inside revision content;
   (b) a `tropical_systems` identity table plus a rebuildable
   `tropical_system_entries` index of each issue (chosen); (c) the identity table
   with history read from revision content. (b) gives simple, indexed history
   queries; (c) remains a fallback if the derived index proves costly.
4. **NHC automation.** (a) The worker writes draft outlooks; (b) the worker only
   queues scheduled pulls, and the desk builds suggestions when the forecaster asks
   (chosen). (a) would create products with no human author.

## Decision

1. New GMS alert revisions accept only the Green level. Their notice types are
   Information, Advisory and All clear; Watch and Warning are CAP only. The owner
   was unsure about the exact list, so these three are the default pending
   confirmation. Older revisions stay as they are.
2. "Raise to warning" (yellow, orange or red) saves the GMS alert as a draft and calls
   `POST /api/v1/cap/escalations`, which creates a CAP draft pre-filled from that
   revision and linked through the existing source parameters. It needs
   `cap.alert.create` and product access to the alert's kind. The CAP lifecycle of
   ADR-0023 then applies. Nothing is created automatically. The green
   alert stays in force until a forecaster withdraws it; the desk shows a
   "Warning raised: <link to the CAP alert>" note on it, and forecasts show the CAP
   warning in its place for that hazard through the source link.
3. New product kinds `marine-forecast` (fixed 05:00 slot, its own PDF template,
   alert lines imported from GMS alerts and CAP warnings) and `marine-alert`
   (a green alert). Kind `marine` stays readable and can only be withdrawn. The
   marine forecast covers 05:00 to 05:00 the next day for Grenada, Carriacou and
   Petite Martinique waters.
   Forecast scheduling and the public land forecast use separate kind sets.
4. The outlook is grouped with the forecasts in the desk and in the public
   navigation; its public URL stays `/weather/tropics`.
5. Tracked systems: `tropical_systems` and `tropical_system_entries` in the
   wxproducts database (migration `wxproducts_0003`). Each outlook system in a
   revision names its tracked system. Public history shows published issues only.
   An exact NHC identifier match links automatically; any other match needs the
   forecaster's confirmation.
6. Scheduled NHC pulls: the NHC worker queues pulls every few hours in season
   (15 May to 30 November) and every 6 hours off season, off by default and switched
   on per environment, marked
   `trigger = 'schedule'` (migration `wxwatch_0008`). Pre-filled values are built on
   request and edited by the forecaster before publishing; edited values keep the
   NHC original.
7. No new permission keys and no change to the main database.

## Open decisions

- Whether raising a warning should withdraw the green alert (default: no, the
  forecaster withdraws it).
- The exact green alert notice types (default: Information, Advisory, All clear).
- GMS approval of the CAP pre-fill wording.

## Consequences

- Easier: one source of warnings (CAP); tracked systems with history; less typing
  for routine NHC values.
- Harder: three product kinds where there was one for marine; a derived index that
  must stay equal to revisions (guarded by a rebuild test); NHC format changes now
  affect a scheduled path (last good data is kept; manual entry always works).
- Forbidden: GMS alerts above green in new revisions; worker writes to wxproducts;
  public exposure of draft systems.
- Follow-ups: owner-merged updates to `src/wxproducts/AGENTS.md`,
  `src/worker/AGENTS.md` (which today forbids automatic NHC collection) and
  `src/cap/AGENTS.md`; GMS approval of the CAP pre-fill wording; update
  `docs/operations/gms-products.md`.
