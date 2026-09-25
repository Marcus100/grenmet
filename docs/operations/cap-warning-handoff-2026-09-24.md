# GMS CAP warning model — agent handoff

24 September 2026 · `/workspace` · branch `dev` at start of this work: `009807cc`

## Read first

- Read `/workspace/AGENTS.md`, `/workspace/SESSION_LOG.md`, `/workspace/docs/technical-overview.md`, and nested `AGENTS.md` before editing any API or web directory. The shared working tree contains extensive unrelated uncommitted changes. Do not reset or reformat it wholesale.
- User approved implementation of the reviewed CAP plan, subject to resolving three policy questions below. Do not treat the old draft plan as a frozen specification: it contains several superseded statements.
- Suggested skills: `api-change` for FastAPI contract edits, `gaa-admin-change` before composer edits, `diagnosing-bugs` for lifecycle defects. The `handoff` skill produced this file.

## Latest product decision (21:15 UTC)

- GMS reconsidered its request to retire the bulletin workflow. **Keep authored bulletins and CAP alerts as distinct products**. A forecast or bulletin may provide deeper context; CAP carries the actionable alert. They share meteorological facts but have separate publication lifecycles and databases. Do not merge all FastAPI routes into one domain or make a bulletin save automatically publish CAP.
- The CAP new-alert composer now offers an optional source bulletin picker. It records `GMS:source-bulletin-kind`, `GMS:source-bulletin-id`, and `GMS:source-bulletin-revision` in the CAP info parameters. The saved-alert view shows them; validation requires a complete, well-formed triplet. There is no cross-database foreign key or live lookup on CAP publication. See `apps/web/gaa-admin/src/lib/cap-bulletin-link.ts`, `components/cap/alert-editor.tsx`, `components/cap/alert-workflow.tsx`, `apps/api/fastapi/src/cap/validation.py`, and `docs/api/contracts.md`.
- The link picker currently lists *current* published bulletin snapshots and stores the selected revision. It does not yet provide a direct public URL to an archived revision or a reverse link on the bulletin. Review those separately if needed; never link a historical alert to a mutable latest-bulletin URL as though it were an exact citation.
- GMS asked for the TAF/METAR composer to resemble eRegister/wxRegister and to have no PDF preview. The aviation component now uses the same `SectionCard` style and a coded-message review panel instead of a paper preview. The approved convention is in `apps/web/gaa-admin/AGENTS.md`. This is a working-draft UI; full message validation, issuance and transmission remain out of scope.
- `pnpm fix:changed`, `pnpm type-check`, FastAPI lint, `pnpm check:drift`, `pnpm guardrails:staged`, and `git diff --check` pass at this checkpoint. No tests were run on the latest edits. Existing CAP level code still embodies obsolete Advisory and colour-to-severity assumptions; do not release it as the final warning model.

## Delivery safety slice (later on 24 September)

- CAP publish jobs are now created only for Public Actual messages. Worker dispatch checks scope and status again for previously queued jobs with an alert ID. No opt-in Exercise destinations exist yet; the default is to suppress push side effects for Exercise, Test, System, Restricted and Private messages.
- RSS now combines current Actual alerts with Actual Cancel messages published within 24 hours. The Cancel item uses its own CAP identifier and XML snapshot. GeoJSON/map outputs contain Actual alerts only; public JSON alert routes still carry labelled Exercise messages for the website. XML for a public Exercise is retrievable by identifier; this is a pull surface, not an automatic push.
- The compact public warning feed keeps Exercise messages in hazard groups for the drill banner but counts only Actual messages in `activeCount`; the GMS site also ignores non-Actual messages when choosing the header level.
- RSS is a bounded convenience feed, not guaranteed delivery or full history. Pollers that need durable message history require a separate delivery contract. This slice changed `src/cap/{service,tasks,router}.py`, `src/worker/dispatch.py`, OpenAPI/generated client, and `docs/api/contracts.md`. No tests were added or run on this latest slice; complete runtime verification before release.
- Static checks after this slice: workspace type-check, FastAPI lint, client drift, staged guardrails and diff check pass. `pnpm fix:changed` is currently blocked by two regex-lint errors in a concurrently edited `apps/web/gaa-admin/src/components/wxproducts/product-desk.test.tsx`; do not modify that unrelated work as part of CAP. Existing CAP warning test expectations for the Exercise count were updated but not run.

## Policy decisions made by GMS

- Three CAP products: Outlook, Watch, Warning. Information remains a bulletin. Retire Advisory, including Small Craft Advisory, as a **product**. Keep old records readable. Describe hazardous seas and effects on small craft explicitly.
- Product is chosen from lead time and likelihood; lead times remain configurable per hazard and undecided. One alert per hazard; a common CAP `incidents` value links related hazards without merging their lifecycles.
- A single 4 × 4 impact × likelihood matrix suggests the display colour for all three products, including Outlook. Green means no Watch or Warning; Outlook may be any matrix colour. A forecaster may override the suggestion with a recorded reason. Colour must not set CAP severity.
- Matrix from `/workspace/temp-files/products/Morning Forecast Report_2026-09-08.pdf` (graphic panel, independently rendered during planning):

  | Likelihood / impact | Minimal | Minor | Significant | Severe |
  | --- | --- | --- | --- | --- |
  | High | Green 4 | Yellow 8 | Orange 13 | Red 16 |
  | Medium | Green 3 | Yellow 7 | Orange 12 | Orange 15 |
  | Low | Green 2 | Green 6 | Yellow 10 | Orange 14 |
  | Very low | Green 1 | Green 5 | Yellow 9 | Yellow 11 |

  Green = No action; Yellow = Be aware; Orange = Be prepared; Red = Take action. The numeric cells are in the PDF. Forecast template options also exist in `apps/api/fastapi/src/wxproducts/fields.json` and `packages/gms/src/products.ts`.
- Drafts may contain Unknown urgency/severity/certainty; publication may not. Watch and Warning require a next-update time. An overdue update leaves the alert in force, marks it overdue publicly and in the staff dashboard, and flags the duty forecaster in-app.
- High priority derives from urgency Immediate/Expected, severity Severe/Extreme, certainty Observed/Likely. Flag it in composer, public site, and staff dashboard. Do not infer it from colour.
- Phrase library is a partial set of editable suggestions, not a complete hazard × severity grid. Do not overwrite authored text. Source: `/workspace/temp-files/Caribbean Context CAP-Ready Phrase Examples of Disaster Impacts.docx`.
- CAP Update replaces the referenced message in its own lineage. New Cancel message references and retires predecessor; it must have a separate identity and preserve the old XML. Replaced pages point to the current message; cancellation shows a grey all-clear with the authored reason for 24 hours; natural expiry shows Ended for 24 hours.
- Public header: yellow/orange/red Outlooks count as alerts; green Outlook alone gives “No active warnings · 1 outlook”; empty gives “No active warnings”; failed feed gives “Warnings unavailable”. Exercise does not count as an active real warning.

## Answers still needed

The current agent sent these as asynchronous questions; wait for GMS's answers before their dependent code changes.

1. **Impact versus CAP severity.** May the four impact labels map by order to CAP severity (Minimal→Minor, Minor→Moderate, Significant→Severe, Severe→Extreme), or must the forecaster assess CAP severity separately? The earlier plan called this one-to-one mapping *proposed*, not approved.
2. **Likelihood versus CAP certainty.** An earlier selection mapped Very low→Unlikely, Low→Possible, Medium→Likely, High→Likely, with Observed counting as High. But the stated Medium percentage band crosses CAP's Likely boundary. Should certainty be assessed separately, while the 4 GMS likelihood labels drive the matrix? Do not silently encode a possibly inconsistent fixed map.
3. **Live Exercise dissemination.** The user selected CAP status Exercise for live staff testing. Push side effects now fail closed for every non-Actual message; RSS and GeoJSON exclude drills. Decide whether to add explicitly exercise-enabled destinations later. Public JSON and directly addressed XML still expose public Exercise messages, so website drill labels and partner expectations require review.

The non-weather authoring rule is that everything authored in the GMS composer gets the model, while imports retain their original content. Use provenance rather than absence of `GMS:product` to distinguish them. The broader authority question remains a policy consideration.

## Corrections to earlier analysis

- TTMS says its green is only for cancellations/discontinuations. It does not establish a regional precedent for green Outlooks; GMS's own matrix now determines their colours. Source: https://www.metoffice.gov.tt/warnings.
- Prior composer Cancel mutated the original CAP message, reusing identifier and sent time; standalone Update/Cancel publish did not retire referenced messages. Natural expiry already removed items from active, but not from the past endpoint.
- The old `awareness_level` convention ties colour to severity. It conflicts with GMS's chosen impact × likelihood model. Do not claim MeteoAlarm compatibility or carry the old colour→severity validation into the finished feature.
- The old plan's acceptance line “Outlook carries no CAP colour” is obsolete. An Outlook may be orange; a Watch/Warning may not be green. The older five-product and 5 × 4 tables in `docs/operations/warning-ibf-framework.md` need marking as superseded after the final model is implemented.
- The phrase library has no Extreme entries and has gaps at other levels. Advisory migration must be staff reviewed; do not bulk rename saved profiles or bulletin records.

## Code already changed in this continuation

These are uncommitted and coexist with a much larger pre-existing dirty tree. Inspect the actual diff before extending work.

- `apps/api/fastapi/src/cap/service.py`: `publish_alert` validates exact sender/identifier/sent references and atomically retires published predecessors on Update/Cancel; `cancel_alert` now creates a separate Cancel message and snapshot; public active/past queries filter validity in SQL before their 100-row cap; natural expiry enters past; public detail/list attaches `replaced_by_identifier` to prior messages.
- `apps/api/fastapi/src/cap/schemas.py`, `openapi.json`, generated `packages/api-client/src/gen/`: replacement link in public schema and generated client.
- `apps/api/fastapi/tests/cap/test_cap_state_machine.py`: distinct Cancel identity, preserved snapshot, Update retirement and reference rejection, natural expiry.
- `apps/web/gms/src/lib/warning-detail.ts` and test: naturally expired messages show Ended; replaced messages are excluded from Ended.
- `apps/web/gms/src/app/(pages)/warnings/[identifier]/page.tsx`: prior message redirects to its published replacement and shows a generic update note. It does not yet distinguish upgrade/downgrade because colour policy is unfinished.
- `docs/api/contracts.md`: lifecycle contract; current level implementation explicitly labelled transitional.
- `apps/web/gaa-admin/src/components/cap/warning-level-picker.test.tsx`: fixed two unrelated Biome regex lint failures in a pre-existing untracked test. The test itself still describes the obsolete four-product/colour-to-severity model and needs replacement after policy answers.

## Remaining engineering work

1. Review lifecycle code for multiple-message reference semantics, status/scope and concurrency. Cancel now requires an authored reason and exposes it on the public record. RSS carries Actual Cancel messages for 24 hours, but does not guarantee delivery to slow or offline pollers. Check `src/cap/router.py`, `src/cap/tasks.py`, `src/worker/publishers.py`, cache keys, and public-scope cases before release.
2. Once answers arrive, replace `src/cap/levels.py`, validation/profile draft rules, `gaa-admin/src/lib/cap-levels.ts`, picker, composer and GMS severity-based colour mapping. Configure/version the GMS matrix, keep impact/likelihood/CAP assessments distinct, require override reason, and separate save-draft from publish validation. Do not infer import provenance from missing parameters.
3. Add next-update field, overdue calculation and staff flag, high-priority presentation, phrase suggestions, linked incident handling, and editable hazard lead-time suggestions. Preserve author control.
4. Keep bulletin authoring and publication separate from CAP, while improving revision-aware links and staff navigation. Retire Advisory only as a new CAP product, with legacy records readable; optional event codes and WMO OID setup are separate interoperability tasks. Review obsolete IBF draft rules.
5. Finish acceptance coverage across API, generated client, composer, GMS page, XML/RSS/GeoJSON, workers, Test/Exercise/Actual status, Public/Restricted/Private scope, expiry boundaries, update/cancel lineage, feed outage, and accessibility. No deployment, commit or external notification has been made.

## Verification so far

- Focused CAP lifecycle/public scope suite: 39 passed at one checkpoint; after SQL eligibility work, 38 passed and 1 host PostgreSQL connection timeout. The timed-out test passed alone. Do not treat the whole suite as green after final edits; rerun against a stable host stack.
- GMS warning-detail tests: 12 passed. FastAPI lint/mypy/Ruff: passed. `pnpm generate:api-client`: passed. `pnpm check:drift`: passed with generated content matching OpenAPI. `pnpm fix:changed`: passed after correcting picker-test regexes. Workspace `pnpm type-check`: passed. `pnpm guardrails:staged` and `git diff --check`: passed at last checkpoint.
- Root instructions require `pnpm fix:changed`, `pnpm type-check`, staged guardrails, and a grep of every importer/callsite before declaring done. API contract edits require OpenAPI regeneration, generated client, `docs/api/contracts.md`, and drift check.

## Sources

- CAP 1.2: https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html
- Met Office warning model: https://weather.metoffice.gov.uk/guides/warnings
- Supplied Caribbean CAP guidance: `/workspace/temp-files/Caribbean CAP Guidance_V0 (2).pdf`
- Supplied phrase library: `/workspace/temp-files/Caribbean Context CAP-Ready Phrase Examples of Disaster Impacts.docx`
- GMS forecast matrix: `/workspace/temp-files/products/Morning Forecast Report_2026-09-08.pdf`
