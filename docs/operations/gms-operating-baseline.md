# GMS operating baseline and acceptance checklist

**Recorded:** 2026-09-10  
**Status:** User-confirmed operating facts and proposed acceptance work; not operational sign-off  
**Client:** GAA; meteorological department: GMS; software delivery partner: Barrels

## Purpose and evidence

This is the first delivery step under the [GAA/GMS programme](../portfolio/gaa-gms-client-programme-plan.md#programme-a--gms-digital-services-and-meteorological-operations). It records current practice, repository evidence and decisions needed before implementation. HR is outside this baseline.

Operating facts below were supplied by the user in this conversation. Repository implementation, deployment and institutional acceptance are separate evidence categories. No live EDIS submission, ADDS lookup, CMO exchange, hardware inspection or recovery exercise was performed for this document.

## Current service register

| Service | Current operation / evidence | Target and remaining acceptance |
| --- | --- | --- |
| TAF | User confirms 00:00, 06:00, 12:00 and 18:00 Grenada local issue times, with 24-hour validity. TAC is manually emailed through EDIS; availability is normally checked in ADDS. | Retain TAC and add IWXXM. Confirm exact validity start/end convention, bulletin metadata, destination and receiver profile from a representative issued report. Track submission and downstream availability separately. |
| METAR / SPECI | User confirms METAR on the hour and SPECI when required. TAC is manually emailed through EDIS; ADDS is checked for availability. | Validate preparation, corrections, exchange and fallback. Preserve source TAC; distinguish local validation, submission, receiver acceptance and downstream observation. |
| SYNOP / WIS2 | User reports a CMO platform handling SYNOP-to-BUFR conversion and WIS2 distribution. SYNOP is also manually emailed through EDIS. | GMS wants its own conversion, validation, publication, incoming-data retrieval and monitoring platform. Confirm identifiers, metadata, cadence and exchange responsibilities. Prove external receipt and recovery before replacing the accepted route. |
| IBF / CAP | User reports CAP warnings/alerts/messages included in operational IBF issuance, but no application currently links them. CAP/IBF also links operationally to bulletins and NHC products. The user is preparing the impact, response and threshold schema; it is not stored yet. | Reconcile that schema with repository fields and the actual procedure. Exercise linked issuance, review, delivery, update and cancellation without assuming an existing software integration. |
| Surface observations | One known automatic weather station, with existing MBIA Sutron data and collector work. | Confirm sensors, timestamps, units, sampling/aggregation, durable storage, export, freshness and recovery on actual equipment. |
| SURFACE | User explicitly confirms experimental status. Repository stack and integration work exist. | Evaluate metadata, ingestion, QC, raw-data preservation and independent recovery before operational adoption. Preserve current operations during evaluation. |
| Hydromet takeover | GMS is taking over an existing hydro-meteorological project. Kenton's application and the current network inventory remain unconfirmed. | Inventory equipment, software, database, licensing, interfaces, historical data and migration size. Do not equate this application with SURFACE, wis2box or the MBIA collector. |
| Routine forecasts | Code and [authored-product documentation](gms-products.md) specify 07:00, 12:00 and 18:00 Grenada time. | Repository evidence only for these schedules: confirm activation, review rules, coverage and operational acceptance. Track individual expected issues and preserve published revisions. |
| Marine / tropical outlook | Repository schedule: marine 05:00; tropical outlook 02:00, 08:00, 14:00 and 20:00 Grenada time. | Confirm active coverage, sources, validity, approval and fallback. Authored-product schedules do not guarantee external source issuance. |
| Model and satellite products | Separate local model-processing and GEONETCast workstations are planned. Model notebooks, NHC ingestion and WxWatch collection exist. | Select and benchmark one representative cycle. Validate provenance, units, times and completeness; queue uploads and publish complete runs. Continuous operation is not established here. |

Grenada local time is UTC−04:00. The confirmed TAF issue times correspond respectively to 04:00, 10:00, 16:00 and 22:00 UTC. Issue time alone does not establish the coded validity start. Confirm date rollover and validity from actual TAC before implementing schedule logic.

For each service, record accepted geography, source, issue/valid times, approval responsibility, channels, archive and fallback. Explicitly establish Grenada, Carriacou and Petite Martinique coverage where relevant; do not infer station or aviation coverage from national service scope. Named service owners and acceptance leads remain to be confirmed.

## National all-hazards CAP scope

**User-confirmed responsibility:** Grenada Meteorological Service is Grenada's CAP focal point. The CAP platform must support all hazards nationally; the GMS public weather website is only one presentation channel and need not display every national hazard.

This supersedes the earlier suggestion to limit platform expansion to weather-related categories. The nine weather product categories are not the national CAP hazard catalogue. National scope includes meteorological, hydrological, geological, health, environmental, fire, transport, infrastructure, public-safety/security and other nationally approved hazards. Exact event names, codes, templates and responsible authorities need a reviewed catalogue; these examples are not an exhaustive approved inventory.

Keep the following distinctions explicit in the proposed design:

| Concern | Required distinction |
| --- | --- |
| National platform | Support all nationally approved hazards and authorized issuing bodies, independently of which products appear on the weather website. |
| Focal point versus hazard authority | GMS's focal-point role does not by itself establish that GMS originates or approves every hazard assessment. Record originating authority, authorized sender, reviewer and distribution responsibilities for each hazard. |
| Meteorological products | IBF, bulletins and locally prepared tropical products can link to CAP messages where appropriate. These are one workflow within the national platform. |
| Non-meteorological products | An authorized national alert must not require a weather forecast, an IBF assessment or NHC source. Provide a distinct reviewed preparation/receipt workflow appropriate to the originating authority. |
| Presentation channels | Define separate publication/distribution policies for national feeds, partner channels and the GMS weather website. Website selection must not suppress otherwise authorized national distribution. |
| Catalogue versus active messages | A supported hazard is not an active warning. Keep hazard, message level, lifecycle state and geographic scope separate. |
| Acceptance | Exercise both a weather-linked issue and a non-weather issue, including authority checks, correction/cancellation and channel selection. |

A specific repository reconciliation is required: the older wxproducts CAP table requires an IBF assessment, as described below. That requirement must not be copied into the national all-hazards workflow. Reconcile it with the separate FastAPI CAP domain before any schema or publication change. Do not create a dummy IBF record for a non-weather alert.

The next catalogue review should identify event family/subtype, responsible authority, input evidence, approved wording/actions, geography, lifecycle, distribution channels and website visibility. New hazard support depends on those rules, not on adding dashboard tiles alone. Runtime and schema changes remain outside this documentation step.

## Implemented national CAP draft authoring

Following the user's explicit implementation request, `/cap/admin/new` now offers 182 event suggestions across 29 national hazard families using the [authoring catalogue](../../apps/web/gaa-admin/src/lib/cap-hazards.ts). These are editable authoring suggestions, not approved thresholds, authority assignments or standardized national event codes. Custom event names remain supported.

Selecting a recognized event suggests one or more of the existing twelve CAP categories. Authors can change them; editing the event resets the suggestions and an unmatched custom event requires category selection. The draft request explicitly sends categories and urgency/severity/certainty through the existing CAP API. No new database or API contract is required, and non-weather drafts do not require an IBF record.

Defaults: English; sender display name Grenada Meteorological Service; user-supplied contact `meteorology@gaa.gd; 1-473-444-4142`; urgency, severity and certainty `Unknown`. The contact and sender are editable. Unknown is an unassessed value, not low risk or an approved final assessment. The existing Actual status, Alert message type and Public scope defaults remain; Save Draft creates a draft rather than publishing. No numeric thresholds, agency-specific instructions or draft regional phrases are automatically activated.

This implementation does not complete national issuing-authority controls, managed/versioned catalogue administration, linked IBF publication or channel-specific website filtering. In particular, the existing GMS public feed presentation can still display unmatched published events under Other warnings; selectable national hazards must not be mistaken for a completed website inclusion policy. Publication and operational acceptance remain separate work.

## Current CAP delivery focus

User direction: defer METLAB discovery and focus on national CAP. Office checks can resume separately; they are not a prerequisite for the following CAP work. The earlier tropical preparation view remains a later weather-specific candidate within this broader platform.

### Draft all-hazards catalogue coverage

The existing [FastAPI categories](../../apps/api/fastapi/src/cap/models.py) already support all twelve CAP categories. The table below is a coverage checklist for review, not an adopted Grenada event-code list, an authority designation or a change to public website tiles. Candidate events may have multiple categories; category alone must not determine severity, urgency, certainty, authority or routing.

| Existing category | Candidate event coverage to review | Authority/evidence needed |
| --- | --- | --- |
| Met | Tropical cyclone, heavy rain, flood, strong wind, thunderstorm/lightning, rough seas, surge/coastal flooding, heat, drought, visibility hazards | GMS rules plus relevant hydrological/coastal evidence; review individual hazards and geographic scope. |
| Geo | Earthquake, volcanic activity/ash, tsunami, landslide | Confirm national originating/issuing arrangements and recognized technical sources for each event. |
| Fire | Bush/forest fire, structural fire and associated smoke | Designated fire/emergency authority; distinguish a confirmed incident from weather favouring fire. |
| Health | Public-health emergency, outbreak, hazardous exposure | Designated health authority and approved public instructions. |
| Env | Pollution, contamination, oil spill and other environmental incidents | Relevant environmental/health/marine authority and incident evidence. |
| Safety | Public-safety threats and protective-action notices | Designated emergency/civil authority, with verified location and actions. |
| Security | Security threats requiring public warning | Designated security authority and release restrictions. |
| Rescue | Search/rescue or missing-person public assistance alerts where nationally approved | Authorized rescue/police counterpart; disclosure and audience rules. |
| Transport | Aviation, maritime or road incidents requiring protective information | Relevant transport/operator/emergency authority; routine service notices need a separate applicability decision. |
| Infra | Dangerous disruption to water, electricity, communications or critical infrastructure | Responsible operator and coordinating authority; verified extent and public consequences. |
| CBRNE | Chemical, biological, radiological, nuclear or high-yield explosive incidents | Designated specialist and emergency authorities; scope and evidence requirements. |
| Other | Nationally approved events not covered adequately elsewhere | Explicit event definition and owner; not a bypass for missing review or authorization. |

Keep related hazards distinct where the evidence or action differs: rainfall versus observed flooding; fire weather versus an active fire; rough offshore seas versus shoreline inundation; dust, smoke and volcanic ash; volcanic activity versus tsunami. Link cascading events without asserting that one automatically establishes another.

### Required catalogue record

Each proposed event needs a stable local identifier/code namespace, public name, aliases, one or more applicable CAP categories, originating authority, authorized sender/reviewer, supporting evidence, geographic scope, message/expiry/update rules, source/version and approval state. Add channel policy separately, including GMS website visibility. Approved contact details belong in controlled operational configuration, not this document.

Keep thresholds and impact/action phrases in reviewed, versioned records linked to the event rather than inventing defaults for missing fields. Record units, accumulation/duration, relevant locations, uncertainty and the reviewer for a threshold. A phrase needs hazard/severity applicability, impact, action, language, source, approval status and supersession history. Regional draft wording remains a candidate until approved locally.

The current `CapHazardType` has a single category and default urgency/severity/certainty; CAP info supports multiple categories. Reconcile how this catalogue seeds a message without silently replacing the forecaster/authority's assessment. Imported `Unknown` values must not be converted to low risk; any stricter local authoring policy is separate from base-format validation.

### First acceptance slice: one weather and one non-weather message

1. Review two catalogue records: a weather-linked heavy-rain/flood case and a non-weather case selected with its responsible authority. Use synthetic exercise data, not a live incident or public issue.
2. Prepare each message with evidence, area, onset/action timing, urgency, severity, certainty, impact/action wording and intended channels. The non-weather case must not require an IBF or NHC product.
3. Confirm originator, approver and sender responsibilities. Review the exact revision; changed assessed content requires re-review under the proposed workflow.
4. Validate format and the agreed national profile separately. Surface unresolved policy questions rather than silently manufacturing values.
5. Exercise publish, update, cancellation, expiry, duplicate submission and a failed channel. Record message/snapshot identity and delivery evidence separately. Do not interpret cancellation or feed failure as an automatic all-clear.
6. Verify national distribution and website selection independently: a message can be eligible for national/partner distribution while excluded from the GMS weather website.

This is the first proposed implementation boundary. No schema migration, route, permission, template activation or transmission is authorized by this documentation step. Before implementation, identify exact affected files and review the existing CAP lifecycle and catalogue endpoints, the older IBF-dependent schema and the channel selection paths. National profile, authority assignments, user threshold schema and final wording remain open; independent catalogue analysis can continue meanwhile.

## IBF and CAP reconciliation

The [warning/IBF framework](warning-ibf-framework.md), [warning operations plan](../internal/warning-operations.md) and [CAP lifecycle ADR](../adr/0007-cap-warning-lifecycle.md) provide material to review. They do not establish that the user's schema has been received or implemented.

The shared [product fields](../../packages/gms/src/products.ts) include impact, response, likelihood and some threshold-related fields. The [visibility filter](../../apps/web/gaa-admin/src/lib/wxproducts/visible-fields.ts) deliberately hides selected impact/risk sections and alert fields from authoring and PDF output while retaining schema and stored data. Do not re-enable them merely to simulate integration.

For weather-linked products, the next bounded analysis is this crosswalk:

| Topic | Evidence or decision required |
| --- | --- |
| Source schema | User schema is being prepared and is not stored yet. Inventory existing fields now; reconcile the supplied version when ready. Leave threshold values and mappings unresolved until reviewed. |
| Hazard and thresholds | Units, duration, location, source, threshold basis and approval; distinguish measurements from forecasts and estimates. |
| Impact and response | Impact descriptions, likelihood, exposure, affected groups and approved protective actions. Do not invent local thresholds. |
| Linked product mapping | Map relationships among IBF, CAP messages, bulletins and NHC products, including source references and revisions. Confirm whether each NHC item is external guidance, a locally authored product or both. Identify CAP fields versus narrative content without assuming one-to-one links or automatic warning generation. |
| Approval and publication | Decide coordinated versus separate approvals, partial-failure handling and duplicate prevention. |
| Lifecycle | Explicit decisions for new messages, updates, cancellation, expiry and IBF correction/withdrawal. IBF or bulletin withdrawal must not silently imply CAP cancellation or an all-clear. An NHC update should prompt review of affected linked products; automatic changes to local warnings require an explicitly approved rule. |
| Distribution | Record prepared, validated, submitted, failed, provider-accepted and observed-downstream states only where supported by evidence. |
| Exercise | Replay a representative event across NHC guidance/products, bulletins, IBF and CAP content, including source update, local revision, cancellation and channel outage, with an operational reviewer. |

No runtime/schema change is included in this baseline. An accepted crosswalk and bounded implementation scope are needed before changing publication paths.

## Tropical product preparation and linked-product workflow

**User-confirmed practice:** Forecasters read Tropical Weather Discussions, Tropical Weather Outlook, Atlantic Cyclone Information and other relevant tropical products, then prepare information for customers. These are multiple inputs to meteorological interpretation. The exact source endpoints covered by the user's label “Atlantic Cyclone Information” and the customer-specific output formats remain to be identified. Do not assume that label names a single API or that every customer product warrants a warning.

### Repository trace

| Layer | Evidence inspected | Implication |
| --- | --- | --- |
| External tropical guidance | [NHC ingestion](../../scripts/gms-ingest/README.md) preserves changed originals and decoded products, including discussions, outlooks and storm products. Its documented CLI does not install a timer, endpoint or dashboard. | Reuse source capture; connect it to a reviewed workflow only after freshness and deployment acceptance. |
| Locally authored tropical product | [Shared product definitions](../../packages/gms/src/products.ts) and the NHC page show the current desk supports the authored `outlook` kind. | The page title “NHC Products” does not establish an interface for all the tropical sources forecasters read. |
| IBF and bulletins | The same definitions cover morning/midday/evening forecasts and hazard bulletins; selected impact fields remain hidden as described above. | Reconcile prepared customer outputs and assessment fields against the user's forthcoming schema. |
| Existing relationship definitions | [IBF schema](../../apps/web/gaa-admin/src/db/wxproducts/schema/ibf.ts), [CAP schema](../../apps/web/gaa-admin/src/db/wxproducts/schema/cap.ts) and [relations](../../apps/web/gaa-admin/src/db/wxproducts/schema/relations.ts) already describe product → IBF assessment → CAP alert and suite/bundle relationships. | These are useful prior design evidence. The inspected consumers of these relationship symbols were schema declarations/relations, not a demonstrated authoring-to-FastAPI publication bridge. Reconcile them before adding another data model. |
| Current authored publication | [Authored-product queries](../../apps/web/gaa-admin/src/db/wxproducts/authored-queries.ts) write immutable revisions, preserve the public snapshot during drafting and reject conflicting revisions. | Preserve these behaviours; the inspected write path does not publish a FastAPI CAP alert. |
| CAP publication | [CAP service](../../apps/api/fastapi/src/cap/service.py) has its own review/publication lifecycle, XML snapshots and cancellation path; [tasks](../../apps/api/fastapi/src/cap/tasks.py) enqueue publication side effects. | Product publication and CAP publication are separate operations today. A queued side effect is not evidence of downstream delivery. |

### Proposed preparation sequence

This is a reviewable workflow proposal, not implemented automation or an approved meteorological policy.

1. **Collect and read.** Present the selected discussions, outlooks, cyclone information and other relevant guidance with source, issue/valid time, retrieval time and freshness. Preserve the exact versions reviewed.
2. **Assess local relevance.** Record relevant systems/hazards, affected geography, expected timing, uncertainty and the forecaster's interpretation for the intended customers. Permit multiple sources and multiple systems in one preparation session; do not force every issue to have a named cyclone.
3. **Prepare customer products.** Draft the appropriate tropical summary, bulletin and/or IBF from that assessment. Retain source references and distinguish external guidance from GMS interpretation. Customer audiences, channels and templates are still to be confirmed.
4. **Review linked warning decisions.** Show related active CAP messages and record whether each needs no change, a new message, an update or cancellation. A routine summary can proceed without a new warning where the approved procedure permits. Threshold-based suggestions await the user's reviewed schema.
5. **Approve exact revisions.** Review source versions, product text, geographic scope, times, impacts/actions and CAP content together. The approval arrangement remains an operational decision; do not bypass existing CAP review. If assessed content changes after approval, require an explicit re-review in the proposed workflow.
6. **Publish with visible outcomes.** Retain each product revision and CAP snapshot identity and expose partial failures. Retrying a failed step must not create duplicate official issues. A coordinated screen must not claim the separate storage/publication operations are atomic.
7. **Monitor and revisit.** A changed source prompts review of related products, rather than automatic rewriting of published content. Record a reason when no local change is needed. Preserve the source/assessment/product/message history and distribution evidence.

The relationship record should identify the exact source version, local product ID and revision, associated assessment version when available, CAP message/snapshot identity, reason for the link and review decision. A product may use several sources and link to several messages; one message may be relevant to several products. This is a conceptual requirement, not a new database schema. Reuse and reconcile existing suite/assessment/bundle concepts first.

### Update and recovery exercise

| Trigger | Proposed behaviour to demonstrate |
| --- | --- |
| New discussion/outlook/cyclone guidance | Identify affected preparations and published products; record reviewed/no-change or draft a revision. Do not overwrite the earlier source. |
| Customer wording correction | Create a product revision; explicitly assess whether any associated CAP content also changes. |
| Changed local hazard assessment | Review affected bulletins, IBFs and CAP messages together; approve the exact revised content before publication. |
| Bulletin or IBF withdrawn | Retain history and require an explicit decision on associated CAP messages; no implied all-clear. |
| Source unavailable or late | Show the last successful source with age and the outage; retain the accepted publication and use the agreed manual fallback. |
| Product publishes but CAP publication fails, or the reverse | Show partial completion, retain successful identifiers and retry only the failed operation under the agreed procedure. |
| A delivery channel fails | Preserve the issued product/message and distinguish publication from channel outcome; retry or use the agreed fallback with evidence. |
| Concurrent edits or repeated submission | Reject stale revisions and demonstrate duplicate prevention. |

**Later weather-specific implementation candidate (after the national CAP foundation):** a forecaster source-review and linked-product preparation view, using existing collection and authored-product capabilities. Its acceptance scenario is one prepared customer tropical product with traceable source versions, a linked bulletin/IBF/CAP review decision, and a source-update/no-change exercise. A usable source/assessment record can be designed before thresholds are ready; automatic CAP generation and a single publish-all action are deferred until schema, approval and recovery rules are reviewed. File scope and implementation approval remain a separate gate.

The repository relationship trace is complete for this documentation step. A real customer example, exact source selection, the forthcoming schema, and operational acceptance remain outstanding.

## WMO Caribbean CAP workshop source

Reviewed the [WMO event page](https://wmo.int/events/common-alerting-protocol-caribbean-dominica-saint-lucia-grenada) on 2026-09-10. It records the Grenada workshop on 3–4 February 2025, hosted by GMS/GAA within CMO/WMO-supported training funded through CREWS Caribbean 2.0. The page lists Grenada's concept note, agenda and Day 1/Day 2 presentations. It does not provide a linked Grenada report.

| Grenada material | Retrieval status |
| --- | --- |
| [Concept note](https://wmoomm.sharepoint.com/:b:/s/wmocpdb/ETJ8Vk93W69Ct9v01CWJMDQB87xRfye69GwYI8G_S85I4g?e=HGVwaj) | Browser fetch failed; direct header request returned SharePoint HTML, not inspected document content. |
| [Agenda](https://wmoomm.sharepoint.com/:b:/s/wmocpdb/EduISnhoNRBFkM5j59_e3IABQrAel4RugbLnlnBhA-V_9w?e=RWUCYP) | Browser fetch failed; contents unreviewed. |
| [Day 1 presentations](https://wmoomm.sharepoint.com/:f:/s/wmocpdb/EriPdG460w5PsRDUEQ9eUwABGhlShOBdhXMPMc3UrcjQ9A?e=LOCE5m) | Folder fetch failed; files not enumerated or reviewed. |
| [Day 2 presentations](https://wmoomm.sharepoint.com/:f:/s/wmocpdb/EvGsPWcgWZ5NvRseFxMFngwBby2CyTD1Ok5qbhvwRW2vMw?e=mPXHhO) | Folder fetch failed; files not enumerated or reviewed. |

Planning consequence: review the training materials for existing national decisions, procedures, exercises and implementation work before inventing replacements. Training participation alone does not establish an approved national profile, issuing-authority register, complete hazard catalogue or production acceptance. Keep the 2025 workshop evidence distinct from the February 2026 regional drafts and the user's forthcoming schema. Unavailable links do not block independent catalogue and lifecycle analysis.

## Email evidence and METLAB assessment

Reviewed Gmail context on 2026-09-10. These are source-reported facts and draft guidance, not operational acceptance or procurement decisions. Preserve this dated summary if a message later becomes unavailable; its disappearance must not change a service rule automatically. Original attachment bytes have not been archived in the repository. Private contact details and mail headers are omitted.

| Source | Review status | Planning consequence |
| --- | --- | --- |
| [Draft Caribbean-Adapted CAP Guidance](https://mail.google.com/mail/#all/1a08c74d026bad6e), forwarded 2026-09-10; original correspondence 2026-02-20; attachment `Caribbean CAP Guidance_V0 (2).pdf` | Email body and attachment text preview reviewed. Connector marked extraction incomplete; full PDF/visual verification remains pending. The material is explicitly draft. | Candidate operational guidance for urgency, severity, certainty, coordination and a five-level trigger framework. It is not a nationally approved all-hazards catalogue or the user's forthcoming schema. |
| [Caribbean Context CAP-Ready Phrase Examples of Disaster Impacts](https://mail.google.com/mail/#all/1a08c74639717f7a), forwarded 2026-09-10; original correspondence 2026-02-20; DOCX of the same title | Full connector text extraction reviewed (five rendered pages). Email explicitly calls the document a draft intended to help develop pre-approved phrases. | Build a reviewed phrase-library proposal with source/version, hazard, severity, impact, action, applicability and approval status. Received examples are not already approved phrases or automatic issue rules. |
| [METLAB correspondence: August 3](https://mail.google.com/mail/#all/1a08c73a0c25f5ab), forwarded 2026-09-10; thread includes January, May, August and September 2026 messages | Plain-text thread reviewed. User also confirms METLAB exists in the office and its practical use is unclear. January's referenced upgrade attachment was not present in this forwarded message. | Evaluate existing METLAB capabilities before duplicating acquisition, flight briefing or transmission. Do not assume offered upgrades were installed or will remain in the final architecture. |

### CAP guidance decisions that remain open

The regional draft discusses urgency, severity and certainty independently, and proposes a high-priority combination and trigger-level matrix. Review these as profile candidates, not universal hazard thresholds. In particular, a watch's hazard onset window must not automatically determine urgency: urgency concerns when protective action is needed.

The draft discourages `Unknown`, while the [OASIS CAP 1.2 specification](https://docs.oasis-open.org/emergency/cap/v1.2/CAP-v1.2-os.html) permits it for urgency, severity and certainty. Distinguish base-format validation from an approved local authoring policy; do not silently recode unknown inputs into low risk. National decisions on these policies, message levels and channel priority remain pending.

The phrase draft covers heavy rain, tropical-storm/hurricane winds, surge/coastal flooding, rough seas, heat, low rainfall/drought, bushfire, lightning and fog/haze. It also distinguishes cascading hazards and primary/secondary impacts. This is useful weather/impact vocabulary, not an exhaustive national event-code list. Review causal groupings, local applicability and health/emergency instructions before reuse; do not encode every association as a causal or threshold rule. Model observed impacts separately from possible forecast impacts.

### What the METLAB email establishes

- Vendor correspondence identifies observer and forecaster workstations (`sr1` and `sr2`) and reports both accessible/current with data on 2026-09-01. These are workstations, not evidence of two automatic weather stations. Their present status and relationship to planned model/GEONETCast equipment remain unverified.
- An August message describes BriefNet flight documentation as working. This is dated vendor evidence, not a local acceptance test.
- September correspondence reports an existing VFIDS process sending hourly TGPY heartbeat messages to NOAA's NWSTG gateway and suggests using it for observation bulletins.
- The reported incoming directory is `/db.run/receive_proc/vfids`; outgoing messages are reported under `/db.run/vfids`. These are vendor-described paths on office equipment, not paths to write in this workspace.
- The vendor explicitly says the required message prefix/framing details still need to be supplied. Examples from Aruba are not a Grenada configuration or proof that GMS METAR/SPECI/SYNOP/TAF or IWXXM delivery is accepted. Do not copy sample framing or drop files into a live sending directory.
- January correspondence offers newer SIGWX IWXXM viewing, additional WIFS model data, wave guidance and later system/data-collection upgrades. Installation, licensing, support, storage/bandwidth suitability and current availability are unverified. Consuming IWXXM SIGWX is distinct from generating and transmitting GMS TAF/METAR IWXXM.
- The thread reports an expired one-year software warranty in January. Confirm current support arrangements; do not infer present support or renewal cost from that historical statement.

### Recommended METLAB discovery sequence

1. Inventory each workstation's role, installed METLAB/BriefNet version, operating system, storage, current data feeds, recent data times, network access, support and backup arrangements. Use read-only inspection; keep accepted operations running.
2. Conduct a guided walkthrough of one familiar task: open current guidance, select the appropriate forecast/valid time and prepare a flight briefing. Record which steps already work and which require configuration or training.
3. Inspect VFIDS status/logs and existing heartbeat history without submitting any message. Obtain the vendor's actual framing, bulletin-header, pickup, retry, acknowledgement and supported-format documentation.
4. Agree a vendor/receiver-coordinated test for each intended product and verify the exact downstream report and timestamp. Distinguish a heartbeat, local queue pickup, gateway acceptance and availability in ADDS or the agreed destination. Preserve manual EDIS until the replacement route is accepted; avoid duplicate operational submissions.
5. Compare the accepted METLAB functions with our planned notebooks, own WIS2 platform and IWXXM work. Decide what to retain, integrate or replace based on measured value, interfaces, rights and support costs. METLAB is neither a presumed replacement for the national CAP platform nor an assumed mandatory long-term dependency.

This assessment is a next-step checklist, not authorization to access office equipment, transmit test reports, contact the vendor, purchase support or change configurations. No emails were sent, moved or deleted during review. Missing documents do not prevent continuing the national CAP catalogue and source/phrase mapping work.

## Infrastructure and data continuity

Use DigitalOcean until an AWS account is available. AWS remains the intended destination. No procurement, provisioning, deployment or configuration migration is established by this conversation. The supplied AWS allocation of USD 750/month and wider operating allocation of USD 1,000/month are planning figures, not a verified DigitalOcean bill or updated quotation.

Preserve staging and production boundaries for the proposed Kenton, web/core and weather-operations groups. Kenton's reported requirement is Ubuntu LTS, at least 16 GB RAM, 512 GB storage, public IP and SSH. Application details and reduced staging sizing need confirmation. Do not provision from this baseline. Repository membership does not establish GMS ownership of other applications.

Reuse local equipment after inventory. Model processing and GEONETCast reception remain on separate local workstations. Temporary processing stays local; publish selected validated JSON, images and animations to object storage under versioned run paths. Advance the latest-successful-run record only after the complete required output set is present. Retain previous products with a stale indicator during outages, queue/retry uploads and restrict each workstation to its own upload scope.

Decide retention for finished outputs, reproducibility inputs and station records. Inventory NAS, internet, backup connectivity, UPS and independent backups before buying equipment. Mirroring or synchronization is not independent backup. Experimental AI is low priority; consuming ECMWF AIFS output does not establish a local inference or GPU requirement.

The [infrastructure guide](../infrastructure.md), [continuity plan](cybersecurity-continuity.md), [weather infrastructure](../../infra/weather/README.md) and [release verification](gms-release-verification.md) contain tooling, intentions and recorded checks. Assertions of operational controls require current evidence. Agree acceptable data loss and recovery time per service; no recovery target or automatic failover is accepted by this baseline. Staging is not an accepted production standby.

## Ordered acceptance checklist

Documentation preparation is complete when confirmed facts and unresolved decisions are recorded. Operational baseline acceptance remains open until applicable evidence below is reviewed.

- [x] Record confirmed aviation cadence, 24-hour TAF validity, EDIS/ADDS practice, CMO route, experimental SURFACE status and IBF/CAP practice.
- [x] Record DigitalOcean interim hosting, future AWS intent, local processing and the separate hydromet discovery boundary.
- [ ] Confirm national all-hazards CAP catalogue, issuing authorities and channel-specific visibility, including the narrower GMS website scope.
- [ ] Confirm owners, active schedules, coverage, approval rules and manual fallback; reconcile contradictory older documents within separately approved file scope.
- [ ] Review representative issued TAF, METAR/SPECI, SYNOP and IBF/CAP examples, with sensitive contact details removed where appropriate.
- [ ] Inventory existing IBF/CAP/bulletin/NHC relationships now; reconcile the user's impact/response/threshold schema when prepared, before implementing its rules.
- [ ] Inventory the automatic weather station, inherited hydromet system, local workstations, storage, network and power protection.
- [ ] Agree retention, acceptable data loss and recovery time per service; identify evidence sources and reviewers.
- [ ] Exercise isolated restore and application recovery, source outage, queued-upload recovery and alternative dissemination; record observed times and failures.
- [ ] Obtain GMS baseline review and select the first bounded implementation and acceptance scenario.

After review, retain current warning, observation and aviation continuity priorities. Prove observation/exchange recovery and complete CAP/IBF delivery, then connect accepted products to public presentation. Mandatory aviation gaps may advance immediately. Expand later services using measured operational performance.

Scientific examples remain separate notebooks per feature/source file/day under the existing notebook organisation; this register does not replace or combine them.
