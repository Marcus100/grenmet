# GMS product strategy and implementation roadmap

> **Status:** Analysis and recommendation — not an authoritative sequencing view.
> Recorded 2026-09-10 from a repository review at `055bdce3`. Current GMS
> priorities, dependencies, and acceptance gates remain governed by the
> [GAA/GMS Client Programme Plan](../portfolio/gaa-gms-client-programme-plan.md);
> Barrels portfolio priority remains governed by the
> [Barrels Portfolio Implementation Plan](../portfolio/barrels-portfolio-implementation-plan.md).
> Nothing here authorizes implementation, procurement, charging, or a change to
> approved operational policy.

Related: [programme roadmap](./roadmap.md) (historical snapshot) ·
[service catalogue](./service-catalogue.md) ·
[product catalogue](./product-catalogue.md) ·
[systems integration roadmap](./integration-roadmap.md) ·
[WIS 2.0 roadmap](./wis2-implementation-roadmap-2026.md)

## Strategic recommendation

GMS should pursue world-class performance as a small-island meteorological service: dependable aviation support, trusted warnings, useful marine and climate information, and specialist services that improve decisions in Grenada, Carriacou and Petite Martinique. The differentiator should be locally accountable expertise, reliable delivery and demonstrated user outcomes. A larger catalogue of web pages or a proprietary global forecasting model would not establish that position.

The recommended sequence is **operational trust → reliable observations and aviation workflows → impact-based national services → repeatable paid services → advanced science and regional expansion**. Commercial discovery starts immediately; commercial service commitments expand only when staffing, data rights, quality and delivery costs support them. Any confirmed current aviation or warning compliance deficiency takes precedence over this discretionary sequence.

This strategy separates three funding relationships. Essential public services require a durable mandate and funding agreement. GAA and other public agencies may fund defined operational support through approved arrangements. Commercial customers pay for additional interpretation, integration, reports and agreed service levels. Internal GAA allocations, grant income and independent commercial sales must remain distinguishable when judging business performance.

GMS's published institutional background places it within GAA and emphasizes aviation alongside public and sector services. The Airports Authority Act compilation reviewed establishes a relevant governance framework but is not a verified current consolidated statement of commercial authority. GAA leadership and legal/finance advisers must determine charging powers, approvals and ownership arrangements before contracts or tariffs are adopted.[^1][^2]

**Planning assumptions:** a small software team of roughly one to three developers, with access to GMS operational specialists alongside their normal duties; no confirmed new procurement budget; existing operational channels continue during digital transition. These are planning assumptions, not known staffing commitments. Evidence was reviewed as of 10 September 2026. Repository evidence establishes implementation and documented verification, not a production-site audit or regulatory certification.

## What the project already contains

The repository is substantially beyond a website prototype, but maturity varies by service. Its internal service catalogue already identifies public weather, warnings, tropical cyclones, aviation, marine, climate, agriculture, hydrology, emergency decision support, health, tourism, data and education. The principal product-management task is to turn that breadth into a controlled sequence of dependable services. Some older documentation describes capabilities as missing even where later code now exists; other documents describe intended services more broadly than current runtime functionality.

| Area | Evidence from the project | Product implication |
|---|---|---|
| Staff identity and GMS access | Shared authentication, approval, MFA, session management, department/grade policies and staff credentials; GMS staffing baseline and real HR workflows | Reuse these foundations. Validate operational permissions and duty coverage rather than build another identity system. |
| Forecast and bulletin publishing | Thirteen authored product kinds; immutable revisions, concurrency protection, separate published snapshots, withdrawal, PDF preview and current-product feed | Finish operational acceptance, issue tracking, review policy and public archive. Existing publication controls are valuable assets. |
| Duty dashboard | Completion is derived from product kinds and currently valid publications | Track each expected issue occurrence. Multiple outlooks in a day and expired earlier issues must not disappear from operational accountability. |
| CAP warnings | Real approval lifecycle, authorization, XML snapshots, queued rendering and webhook delivery logic | Prove recipient delivery and recovery. A generated social graphic does not establish social-channel distribution. |
| Delivery status | Publisher handlers can return a skipped result while dispatch records job success | Separate execution outcome, artifact production, provider acceptance, delivery and partner acknowledgement. Staff need actionable failure states. |
| Public GMS site | Broad routes, issued-product integration and dated reference content; many service pages remain placeholders | Launch a smaller, dependable public service first. Display freshness and unavailable states consistently. |
| Aviation | Browser-saved draft composer and PDF previews; documented transmission not implemented | Treat the composer as a starting point. Operational issue lifecycle, approved data sources, exchange and recipient evidence remain separate work. |
| Observations | Sutron collection, parsing, storage, SURFACE export and deployment assets exist | Validate the production chain. Documentation that still calls storage/export deferred understates the code. |
| SURFACE | Existing observation management, range/step/persistence QC and station/equipment/maintenance models | Configure and validate existing science and asset workflows. Do not commission a second QC or station-management system by default. |
| WIS2 | A separate SURFACE/wis2box path is documented and sandbox evidence exists | Complete sustained operation, metadata and discovery checks. FastAPI's skipped WIS2 publisher is not the intended observation exchange path. |
| Forecast guidance | WxWatch imagery collection and private proxy support; NHC ingestion preserves original and changed source products | Complete scheduling, freshness, operational presentation and provenance. Avoid rebuilding collectors or a proxy already present. |
| CMS and education | Editorial CMS with publishing controls; existing preparedness documentation; GMS editorial content still partly static | Connect reusable approved education content while keeping weather publication in its operational systems. |
| Commerce | Stripe checkout scaffolding; webhook service verifies/logs events without a complete persisted entitlement lifecycle | The project is not a commercial service platform yet. Start with approved contracts and finance procedures before billing automation. |
| Operational assurance | Tests and release verification documents, backup workflows, browser acceptance checklist with pending work | Distinguish local checks from accepted operational service. Demonstrate restore, degraded operation, user acceptance and ongoing ownership. |

These findings are grounded in the project evidence index at the end of this report. They do not imply that existing live GMS operations are absent simply because their implementation is outside this repository.

Two implementation details deserve early attention. The authored-product dashboard currently counts kinds against a feed of currently valid products, which is a poor basis for a daily service ledger. Separately, the collector's off-hour schedule and SURFACE's exact top-of-hour selection need an explicit sampling contract: preserve true timestamps, investigate existing legacy feeds and agree valid aggregation rather than relabel observations to make an integration pass.

## Lessons from external organisations

The organisations below are benchmarks for particular capabilities, not an independently verified ranking of the world's best agencies. Commercial providers describe their own products; their accuracy, savings and return-on-investment claims have not been independently established for Grenada.

| Organisation or framework | Observed practice | Recommended GMS application | Boundary |
|---|---|---|---|
| WMO Early Warnings for All | Connects risk knowledge, monitoring/forecasting, communication and preparedness/response | Design the complete warning service, including partner actions, community comprehension and exercises | A CAP composer alone covers only part of the system.[^3] |
| NOAA National Weather Service | Impact-based decision support for core partners | Named emergency partners, pre-agreed decisions, briefing templates, uncertainty and post-event review | Adapt the operating practice to local staffing and authority.[^4] |
| UK Met Office | Specialist aviation and event services alongside wider meteorological services | Airport decision briefs; event/site forecasts with agreed thresholds, staffing and support scope | Validate local demand and capacity before promising dedicated support.[^5][^6] |
| MetService New Zealand | Public-service responsibilities alongside specialist services; current strategy emphasizes impacts, resilience and commercial efficiency | Explicit public-service funding, service costing and value-added expertise | Its institutional structure is undergoing reform; do not transplant an old SOE description into GMS governance.[^7][^8] |
| CIMH Caribbean Regional Climate Centre | Regional climate monitoring, outlooks and sector information | Localize regional guidance for water, agriculture, health and tourism; share verification and expertise | Avoid duplicating an entire regional seasonal forecasting centre.[^9] |
| NHC | Probability and timing graphics alongside cyclone advisories | Present local hazard onset windows, uncertainty and action deadlines | Check geographic coverage and licensing per product; US-specific surge products are not Grenada inundation forecasts.[^10] |
| Meteorological Service Singapore | Location-oriented lightning information showing observation age and detection domain | Airport, event and marine interfaces that distinguish observed lightning from forecast risk | Requires suitable detection data, coverage validation and local protocols.[^11] |
| Tomorrow.io | Configurable operational protocols and notifications | Customer site → weather threshold → required action → responsible person → acknowledgement | Begin with approved rules and people, before complex automation.[^12] |
| DTN | Utility risk products combine weather with customer infrastructure and operational data | Joint utility pilots using asset exposure and event history | An asset map is feasible earlier than a validated outage-prediction model.[^13] |
| Vaisala | Observation equipment lifecycle, maintenance and support | Station health, calibration records, spare-parts planning and failure response | Reuse SURFACE capabilities; select hardware only after a coverage and lifecycle assessment.[^14] |
| Meteomatics | Weather delivery shaped around sector decisions and data integration | Stable data contracts and a small number of customer-specific variables | Start with actual Grenadian use cases rather than copying foreign energy-trading products.[^15] |
| EUROCONTROL | Shared weather assessment and collaborative airport decisions | One MBIA weather briefing view shared by meteorology, airport operations, ATC and operators | This is a coordination pattern, not adoption of European network obligations or authority to close runways.[^16] |
| Esri | Combines hazards with exposure and vulnerability information | Versioned maps of vulnerable communities and critical assets with partner-supplied data | The pattern does not require purchasing a particular GIS platform.[^17] |
| CCRIF | Weather-risk products serve governments and exposed sectors | Traceable observations, event reconstructions and technical partnerships | GMS should not infer that meteorological expertise authorizes underwriting or payout decisions.[^18] |
| ECMWF | Open forecast datasets and operational modelling resources | Evaluate external model guidance locally and preserve source/model versions | Open data still has attribution, infrastructure and service costs; local validation remains necessary.[^19] |
| WMO/NORCAP ClimWeb | Open-source NMHS platform combining content, CAP, maps and climate information | Capability comparison, design lessons and selective reuse where compatible | Existing GMS investment makes a wholesale migration a business case to prove, not the default.[^20] |

The shared lesson is that customers need a decision service. A forecast becomes more useful when it specifies the place, hazard window, confidence, operational implication, next update and responsible contact. The reusable product foundation should make those elements consistent across public bulletins, agency briefings and approved commercial services. This is a product recommendation derived from the comparison, not a prescribed WMO interface.

## WMO and ICAO alignment

The first standards deliverable should be a controlled applicability register. For every applicable requirement, record the authoritative publication and edition, local applicability, accountable authority, service/process affected, implementation evidence, test or inspection evidence, training requirement and review date. Separate mandatory obligations, recommended practices and GMS policy choices. A software feature checklist cannot establish institutional compliance.

WMO reports that Annex 3, 21st edition incorporating Amendment 82, and the first PANS-MET, Doc 10157, became applicable on 27 November 2025. Existing project documents should therefore be checked against that restructured framework and subsequent applicable changes. Public summaries establish the change, but they do not substitute for controlled access to the full texts, local aviation requirements and Caribbean regional arrangements.[^21]

| Reference | How it shapes the product | Evidence required before claiming readiness |
|---|---|---|
| ICAO Annex 3 and PANS-MET | Approved aviation products, issue/change rules, responsibilities, exchange and contingency workflows | Aviation authority applicability review; authorized staff; validated messages; receipt through approved channels; exercised fallback. Do not assume GMS has every regional SIGMET responsibility. |
| ICAO IWXXM guidance | Structured aviation exchange through an adapter at the approved operational boundary | Required schema/version and code-list validation, recipient interoperability and round-trip interpretation. Do not label a PDF or CAP message IWXXM compliant.[^22] |
| WMO observation guidance and WIGOS | Metadata, siting, instruments, calibration, maintenance and quality controls | Station and instrument records, true timestamps, QC provenance, maintenance evidence and designated ownership. Confirm authoritative editions; distinguish preliminary updates from adopted guidance.[^23] |
| WIS2, WIGOS and WDQMS | Discoverable exchange, stable station identities and monitoring of timeliness, availability and quality | External discovery/receipt checks, correct station metadata and sustained monitoring, not merely a locally successful export.[^24][^25] |
| WMO Unified Data Policy | Dataset-specific treatment of core and recommended exchange | Classified datasets and approved licences/terms. Do not place core exchange obligations behind a commercial paywall.[^26] |
| CAP and WMO alerting-authority guidance | Authorized warning identity, interoperable messages, updates/cancellation and discoverable feeds | CAP validation, authority/area review and receiver exercises. The Register of Alerting Authorities helps identify authoritative sources; it is not itself the delivery transport.[^27] |
| Early Warnings for All | Public reach, risk understanding and preparedness are part of the service | Partner and community exercises, accessibility tests, outcome reviews and evidence of corrective action.[^3] |
| WMO climate services framework | Connect user engagement, information systems, observations, science and capacity | Reproducible climate products, appropriate records, qualified interpretation and evidence that intended users can act on the information.[^28] |
| WMO public-private engagement principles | Preserve authoritative public warnings and sustainable, transparent partnerships | Public/commercial service boundary, rights and attribution register, conflict handling and published service commitments.[^29] |

Warning colours, local thresholds, mandatory second review and target delivery times require explicit local decisions. They must not be presented as universal WMO requirements. For example, expiry means the message's validity ended; whether conditions warrant an all-clear is a separate authorized assessment.

## Ordered implementation backlog

### Product portfolio and user experience

This roadmap contains twelve product families. They describe proposed user capabilities; the F01–F50 packages and E01–E18 extensions below determine delivery. Extensions are integrated into the release sequence, not deferred until after F50. Together these are 68 traceable feature/work packages, not 68 applications or a commitment to fund every idea.

Use four evidence states when refining the backlog: **implemented** means code/configuration exists; **accepted** requires demonstrated operation approved by the accountable service owner; **proposed** means a recommendation; **conditional** means a data, authority, staffing or demand prerequisite remains unresolved. The repository is not a complete inventory of existing live services outside it.

#### 1. Public weather and warnings

Residents, visitors and media should understand what affects their location, when and what action is advised. Start with current official forecasts/warnings, named island/zone selection, issue/validity times, affected-area text, next update and a marine link. Information must remain understandable without loading a map.

Provide stable issue references, printable views and explicit replacement/cancellation context. Later add saved places, opt-in alerts, approved language variants and preparedness content. Offline material must retain its retrieval time and state that current status cannot be confirmed. Silence on a chosen channel must not imply absence of hazards.

Acceptance: representative users identify the current message and action under poor connectivity, including outer-island users. Measure comprehension, not only visits. Packages: F07–F13, F26, F32. Essential public safety access remains publicly funded.

#### 2. Forecaster production desk

The duty meteorologist should see scheduled issue occurrences, assigned work, drafts, source freshness, unresolved warnings and delivery failures. Reuse current authoring, revisions and permissions; complete preview, validation, corrections, review policy and handover before sophisticated automation.

Expand with approved reusable wording, side-by-side revisions, reminders, source-linked drafting assistance and briefing packs assembled from approved outputs. Any carried-forward content must be marked for review so old hazard timings cannot silently enter a new issue. Handover should reference authoritative records rather than duplicate them.

Acceptance: a substitute can complete the shift and every expected issue remains traceable after expiry. Measure preparation time and correction causes. Packages: F04, F06–F07, F09–F14, F19.

#### 3. Observation and station service

Observers, technicians and forecasters should distinguish timely data from credible data. Start with station map/list, expected cadence, latest observation time, per-variable QC, units, sensors, communications state and maintenance owner. Show missing intervals and separate raw from reviewed values.

Expand with station comparisons, calibration history, field inspection attachments, spare-parts status, controlled manual entry, bulk import and rescue tasks. Reuse SURFACE models and QC after checking existing interfaces. A connected station is not necessarily a scientifically reliable station; late arrivals need true observation times and arrival context.

Acceptance: staff explain a suspect value, identify affected products and assign maintenance action. Validate underlying flag meanings before simplifying public quality labels. Packages: F15–F18, E03–E05.

#### 4. Aviation meteorological service

Authorized staff should issue METAR/SPECI and TAF using accepted sources and approved exchange. Counterparts need current validity, correction/supersession history, source freshness and briefing context. A public weather dashboard does not replace the approved aviation information channel.

Expand with aerodrome hazard coordination, accepted wind/visibility trends, briefing receipts, climatology and incident reconstruction. Runway wind calculations need correct orientation, wind conventions, source age and agreed usage. They do not establish aircraft-specific operating limits or transfer airport, ATC or pilot decisions to GMS.

Acceptance: aviation counterparts approve normal, amendment, correction, source-outage and communications-failure scenarios. Mandatory gaps advance ahead of optional features. Packages: F02, F20–F25, E08/E13.

#### 5. National impact and emergency decisions

Emergency managers and infrastructure operators should receive a traceable event briefing with authoritative warnings, local hazard windows, confidence, scenarios, impacts, decision deadlines and next update. Name islands/zones explicitly rather than relying on a national average.

Expand with exposure overlays, reviewed impact reports, acknowledgement, questions, decisions and event replay. Preserve what information was available at each decision time. Unverified reports remain distinct from confirmed impacts; closure and evacuation decisions remain with the responsible authority.

Acceptance: an exercise demonstrates timely partner action and fallback when a priority message fails. Packages: F10–F12, F26–F30, F33, E09/E18.

#### 6. Marine and coastal service

Fisherfolk, inter-island operators, marinas, ports and coastal communities should identify relevant zones and hazardous windows. Start with approved wind, sea and swell information, small-craft wording and low-bandwidth formats. Co-design names and language with outer-island users.

Expand with route-area summaries, site briefings, sourced tidal information with datum, and a bounded water-level pilot where observations/expertise support it. Offshore guidance must not imply validated conditions inside every bay. Route summaries provide meteorological support, not vessel-specific navigation or guaranteed safe passage.

Acceptance: users interpret the zone and hazard window correctly; commercial customers identify added value beyond public bulletins. Packages: F19, F26–F27, F31, F40, E14.

#### 7. Climate records and data requests

Analysts, researchers, planners and businesses should discover suitable historical evidence. Start with station/parameter search, period of record, completeness, quality state, metadata, permitted downloads and scoped requests with status. Every delivery needs units, timestamps, missing-value conventions, version and terms.

Expand with saved requests, asynchronous bulk export, version comparisons, source-image links and notices when material corrections affect previous deliveries. Preserve the exact supplied dataset. Correction features must not disclose unrelated customer information.

Acceptance: recipients interpret the data correctly and staff reproduce what was supplied. Packages: F34, F36–F38, E01/E03/E05. Required open access and chargeable specialist work stay distinguishable.

#### 8. Climate product studio

Meteorologists should create consistent products without repeating undocumented spreadsheet work. Start with one monthly rainfall summary: select an approved dataset/month, inspect completeness, generate charts/tables, review interpretation and publish. Complete this workflow before building a general report designer.

Expand with temperature/annual summaries, wet/dry spells, comparisons, eligible normals and selected extreme indices. Each generator needs an owner, version, input contract, quality rules, reference period and reproducible output. Presentation edits must not silently change calculations.

NIWA describes CliDEsc's product generators as decoupled from a particular database design. Evaluate that pattern for GMS without assuming platform replacement.[^33] Acceptance: another meteorologist reproduces an issued report. Packages: F34–F37, E01–E02/E06–E08.

#### 9. Seasonal climate and drought decisions

Water, agriculture, health and tourism planners need locally interpreted guidance connected to decisions over coming months. Start with suitable Caribbean guidance, observations, uncertainty and explicit decision implications. Archive original probabilities, issue dates, source/model versions and target periods.

CIMH already publishes regional sector products; localization and adoption should precede a new national seasonal model.[^34] Expand with appropriate drought-index timescales, sector calendars and evaluated calibration. Seasonal rainfall probabilities are not deterministic daily schedules. Meteorological drought, crop stress and water shortage need different evidence.

Acceptance: users understand uncertainty and scientific evaluation is reproducible by season, lead and location. WMO long-range verification is a reference, not automatic adoption of global-centre designation obligations.[^35] Packages: F33–F35, F43–F45, E10/E15.

#### 10. Climate atlas and adaptation information

Public users, schools and planners should explore historical climate and understand possible future changes. Start with reviewed station climatologies, explanatory maps, island factsheets and downloadable booklets. Show period, coverage and limitations; smooth maps must not imply measurements everywhere.

Later separate observations, reanalysis and projections, with scenario, period, baseline and uncertainty controls. Copernicus's atlas demonstrates useful presentation of these distinctions.[^36] Curate appropriate external resources first, then develop local analyses where competence and evidence support them.

Acceptance: users distinguish observations, model estimates and conditional projections. Finer display resolution is not proof of local accuracy. Packages: F34–F35, F47–F48, E07/E12/E16.

#### 11. Sector and commercial decisions

A buyer at an event, hotel, marina, port or utility should purchase a defined decision service. Start manually with one site, decision, time horizon, briefing cadence, contact route and review. Reference official warnings while adding the customer's agreed interpretation.

Expand with customer sites, threshold agreements, briefing history, requests, support hours, delivery preferences, renewals and integrations. Build dashboards when repeat workflows justify them. Record labour/support costs before assuming subscription margins.

Acceptance: independent customers pay and return, contribution is credible and public capacity remains protected. Packages: F05, F38–F46, E17. Price and market size remain hypotheses until evidenced.

#### 12. Learning, trust and improvement

Staff need complete operational practice, managers need readiness evidence and partners need help interpreting products. Start with task checklists, examples, supervised practice, assessment and a support route. Include failed inputs and uncertainty, not just form completion.

WMO climate-service competencies cover datasets, derived products, forecasts/projections, quality and communication.[^37] Use these to structure outcomes, then add refresher exercises, peer demonstrations, a searchable knowledge base and product-linked support trends. A dedicated learning platform is optional.

Acceptance: a backup performs the task independently and explains limitations; repeated user problems generate measurable improvements. Packages: F04–F05, F14, F25, F32–F33, E11/E18.

### Product investment rules

Protect obligations and current continuity first. Next address demonstrated failures and foundations that unlock multiple services. Then select the smallest complete product real users can evaluate. Commercial attractiveness is considered alongside public benefit, scientific defensibility, operating cost and adoption.

For each feature record user decision, workaround, expected benefit, data readiness, scientific confidence, owner, dependencies, ongoing cost and acceptance evidence. Mark unknowns explicitly rather than invent demand or ROI scores.

Build local authoring/review/decision workflows; reuse suitable existing software and methods; partner for guidance, specialist science, sector data and training; procure missing observations/services after whole-life assessment; defer unsupported or unsustainable claims.


The following 50 feature packages are recommendations. The numbering establishes a default investment order; dependencies establish the actual build order. Work already required for safe current operations moves ahead immediately. Several packages combine software, procedures, training and partner agreements because a meteorological service cannot be delivered by software alone.

Owner abbreviations: **MET** GMS operational lead; **ENG** software/infrastructure team; **AV** aviation service lead and relevant aviation counterparts; **OBS** observation/data lead; **PART** relevant sector or emergency partner; **FIN** GAA finance/legal; **PM** product/service owner. These denote responsibilities to assign, not additional staff known to exist. Release criteria are proposed acceptance conditions, not claims about present performance.

### Wave 0 — Establish service ownership and evidence

| Order | Feature and minimum useful scope | Existing basis; dependencies | Release criterion; accountable owner |
|---|---|---|---|
| F01 | **Approved service and product register.** Define audience, decision, coverage, schedule/timezone, validity, source, issuer, reviewer, channels and contingency for each active product. | Detailed draft catalogues exist. Start immediately. | MET signs the active register; conflicting documented schedules are resolved; non-active products are clearly labelled. MET/PM. |
| F02 | **Current standards and authority register.** Map aviation, warnings, observations and exchange requirements to procedures and evidence; record outstanding gaps by severity. | Draft compliance documents exist; depends on F01. | Named owners approve applicability and escalation; urgent mandatory gaps enter the immediate queue. AV/MET. |
| F03 | **Operational continuity and release acceptance.** Exercise restores, failed dependencies, publication fallback, source outages and staff access; define who supports each system. | Backups and release checks exist; full operational recovery evidence incomplete. | An observed exercise restores the necessary data/artifacts and allows an authorized shift to continue or use its fallback; browser and PDF acceptance completed for launch scope. ENG/MET. |
| F04 | **Competence-aware duty and handover record.** Show who is authorized, competent and on duty; pending products, warnings, sources and maintenance incidents pass to the next shift. | Reuse HR, grades and credentials; F01–F03. | A shift change preserves every open operational obligation; access changes take effect; a substitute can execute the documented workflow. MET. |
| F05 | **Decision research and commercial discovery register.** Interview public users and decision-makers; record decision, deadline, current workaround, consequence, buyer and budget route. | Stakeholder research plan exists; no completion assumed. Can run alongside F01. | Proposed initial sample: 12–15 interviews spanning aviation, emergency management, outer islands, fisheries, utilities and potential paying organisations; select one public and one commercial pilot on evidence. PM/PART. |

### Wave 1 — Complete a dependable public publishing and warning service

| Order | Feature and minimum useful scope | Existing basis; dependencies | Release criterion; accountable owner |
|---|---|---|---|
| F06 | **Scheduled issue ledger.** Represent each expected issue, due time, author, status, lateness and approved omission; include repeated daily outlooks and marine issues. | Replace dashboard assumptions, preserve authored products; F01. | Each scheduled occurrence remains auditable after expiry, revision and withdrawal; missed issues have an owner. ENG/MET. |
| F07 | **Operational forecast desk.** Finish forecast/bulletin forms, preview, correction reasons, appropriate review policy and issue acknowledgements. | Mature authored-product core; F01–F04, F06. | Representative authorized staff complete creation, correction, withdrawal and conflict scenarios; every public output matches the approved issue. MET/ENG. |
| F08 | **Trustworthy public home and current products.** Mobile-first forecast, warning, marine summary, affected places, validity, next update, actions and source freshness. | Current feed and public pages exist; F07 and existing CAP source. | A public usability session identifies the current message and next action; empty, unavailable, future and expired states cannot be confused. PM/MET. |
| F09 | **Searchable product archive.** Preserve official issues, revisions, replacements and withdrawals; search date, place, hazard and product; provide stable references. | Immutable internal history exists; F06–F07. | An incident can be reconstructed without exposing private drafts or staff account data; archival pages cannot be mistaken for current warnings. ENG/MET. |
| F10 | **Truthful dissemination console.** Separate queued, generated, unconfigured, provider-accepted, delivered where observable, failed and acknowledged states; show retries and responsible operator. | CAP jobs/webhooks exist; F03 and channel inventory. | An unconfigured/skipped route is visibly not delivered; partial failures can be retried without duplicating successful destinations. ENG/MET. |
| F11 | **CAP lifecycle and receiver acceptance.** Validate message identity, areas, update/cancel references, actual/test/exercise separation and approved public scope with real recipients. | CAP lifecycle exists; F02, F10. | A controlled receiver exercise demonstrates initial alert, update, cancellation and outage recovery with recorded outcomes; authority registration status reviewed. MET/PART. |
| F12 | **Linked hazard event workspace.** Associate CAP, narrative bulletin, graphics, source guidance and briefings with one event; preserve distinct lifecycles. | CAP and authored bulletins are separate; F09, F11. | Operators can trace each official representation and spot inconsistency; no automatic status propagation creates unintended warnings or all-clears. MET/ENG. |
| F13 | **Public and media distribution pack.** Consistent short text, accessible web view, printable bulletin and approved share image; onboard priority media/agency channels. | Existing PDF/image rendering; F08, F10–F12. | Selected partners can receive and republish the same issue with attribution, validity and update link; undelivered priority messages trigger the documented fallback. MET/PART. |
| F14 | **Service-performance baseline.** Measure issue punctuality, publication/delivery latency, failures, corrections and user feedback; open incident and improvement records. | Audit history exists; F06, F09–F13. | A full representative operating cycle produces a reviewed report with denominators and missing-data explanations; actions have owners. PM/MET. |

Wave 1 should deliver a bounded operational service rather than every visible route in the current site. Current approved external observations can continue supporting publication while the new observation chain is accepted. The public service should not wait for a complete climate portal or a new observation network.

### Wave 2 — Strengthen observations, guidance and aviation

Observation and aviation work can progress together if specialist availability permits. The numbered order does not require waiting for WIS2 completion before correcting an aviation deficiency. Each live replacement needs a controlled comparison with the existing accepted process.

| Order | Feature and minimum useful scope | Existing basis; dependencies | Release criterion; accountable owner |
|---|---|---|---|
| F15 | **Station and instrument health register.** Configure station identity, siting, sensors, calibration, communications, maintenance, spares and local contacts. | Reuse SURFACE station/equipment/maintenance models; F02–F03. | Every station in pilot scope has an accountable owner and documented health/maintenance status; public station availability is distinguishable from quality. OBS. |
| F16 | **Accepted edge-to-SURFACE observation chain.** Resolve serial ownership, supported runtime, raw preservation, timestamps, duplicate handling and top-of-hour semantics. | Collector/storage/export already implemented; F15. | Compare source records end to end across normal operation, restart and outage; explain missing/duplicate samples; do not fabricate observation times. OBS/ENG. |
| F17 | **Operational QC and correction workbench.** Configure existing range/step/persistence tests; preserve raw values, flags, rule provenance and reviewer corrections. | SURFACE QC exists; F15–F16. | Known bad samples are detected in a reviewed test set; unusual valid extremes remain reviewable; corrected datasets are reproducible. OBS/MET. |
| F18 | **Production WIS2 exchange and monitoring.** Complete station/discovery metadata, sustained publication, external receipt, real-time retrieval of required external data and WDQMS follow-up through the designated stack. | Separate SURFACE/wis2box integration; F02, F15–F16; respect approved exchange QC policy. | A sustained acceptance run demonstrates correct metadata, timing, external accessibility and real-time retrieval with documented outage/recovery procedures; failures become assigned incidents. OBS/ENG. See the CMO evidence review below. |
| F19 | **Operational guidance shelf.** Bring accepted satellite, model, NHC and other feeds into one forecaster view with coverage, issuance time, freshness and provenance. | WxWatch/proxy and NHC ingestion exist; F03, F07. | Each enabled source has a schedule, rights record, failure state and traceable original; staff can distinguish old guidance from a new issue. MET/ENG. |
| F20 | **METAR/SPECI operational workflow.** Connect approved observation sources and validated coding, correction, issue history and documented existing transmission route. | Composer is not a transmitting system; F02–F04, accepted sources. | AV signs representative normal and exceptional reports, transmission/recipient evidence and fallback; scheduling timezone is explicit. AV. |
| F21 | **TAF lifecycle and review workspace.** Implement approved issue schedule and amendment/correction/cancellation rules, forecast reasoning and versioned issue history. | Draft composer/PDF basis; F02, F04, F19–F20 as applicable. | Correct operational state is maintained through overlapping validity, amendments, shift changes and transmission failures. AV. |
| F22 | **Aviation exchange adapter.** Support the required formats, IWXXM version, validation and approved receiving systems without replacing the whole product store. | New boundary integration; F02, F20–F21. | Actual required recipients accept representative messages; schema-valid content also passes meteorological/operational checks. Move earlier if needed for present obligations. AV/ENG. |
| F23 | **MBIA weather decision board.** Current METAR/SPECI/TAF, accepted trends, source age, aerodrome hazards, agreed thresholds and briefing record. | GAA relationship and existing views; F19–F21. | ATC, airport operations and meteorology use a shared exercise successfully; data age and responsibility for each operational decision are explicit. AV/PART. |
| F24 | **Aerodrome hazard coordination.** Approved thunderstorm/lightning, wind, visibility and other locally relevant protocols; receipt and escalation to operational counterparts. | Threshold and sensor capability must be confirmed; F10, F23. | Agreed scenarios trigger the right meteorological notification and responsible partner action; unsupported windshear/lightning detection is never implied. AV/PART. |
| F25 | **Aviation quality and verification evidence.** TAF/METAR-related quality indicators, complaints, competency evidence, incidents, corrective actions and controlled SOPs. | Draft compliance/quality plans; instrumentation starts earlier; F20–F24. | AV reviews a complete service period and closes or escalates findings; regulator/auditor evidence is organized. This alone does not assert QMS certification. AV. |

### Wave 3 — Make national forecasts actionable

| Order | Feature and minimum useful scope | Existing basis; dependencies | Release criterion; accountable owner |
|---|---|---|---|
| F26 | **Local hazard zones and exposure catalogue.** Approved land/marine boundaries, outer-island coverage, critical facilities and vulnerable locations with provenance and update owner. | Existing maps/frameworks; partner datasets needed; F05, F12. | MET and relevant partners validate boundaries, ownership and permitted disclosure; uncertain exposure is visibly distinguished. MET/PART. |
| F27 | **Partner decision and threshold register.** Record weather concern, trigger, lead-time need, uncertainty, responsible agency and decision authority. | Draft research and impact frameworks; F05, F26. | Emergency management and a small pilot partner group approve usable triggers in an exercise; example thresholds are replaced by local agreements. MET/PART. |
| F28 | **Tropical cyclone decision briefing.** Local hazard timing, plausible scenarios, confidence, island-specific concerns, action deadlines and next update, linked to source guidance. | NHC ingestion/outlook authoring; F12, F19, F26–F27. | A retrospective cyclone exercise produces consistent official updates without presenting the track cone as the hazard boundary. MET. |
| F29 | **Impact-based warning workbench.** Combine hazard likelihood with documented exposure/vulnerability and approved impact/action wording; retain rationale and uncertainty. | CAP and draft IBF framework; F11–F12, F26–F28. | Forecasters and partners independently interpret the warning consistently; corrections and evidence remain traceable. MET/PART. |
| F30 | **Emergency partner briefing room.** Controlled briefing access, situation timeline, acknowledgement, questions, decisions and follow-up; printable/offline fallback. | Shared identity and event history; F10, F27–F29. | A multi-agency exercise records who received the briefing and which decisions need follow-up, without publishing sensitive operational data. MET/PART. |
| F31 | **Useful marine and fisherfolk service.** Approved zones, wind/wave/swell information, hazardous windows, small-craft wording and low-bandwidth distribution. | Marine authoring already exists; F13, F19, F26–F27. | Fisheries, small-vessel users and inter-island stakeholders understand the product; local resolution limitations are stated; mandatory basic products stay accessible. MET/PART. |
| F32 | **Opt-in local alerts and accessible education.** Location/hazard preferences, consent, unsubscribe, approved explainers and channel preferences; integrate existing editorial assets. | Public site, CMS and education content; F08, F11, F13. | Users can subscribe and stop messages; accessible tests include older devices/poor connectivity; offline content shows age and cannot claim current safety. PM/ENG. |
| F33 | **Forecast, warning and impact verification.** Match archived forecasts to observations and reviewed impact reports; evaluate skill, lead time, misses, false alarms and user actions. | F09, F14, F17, F28–F31. | A reproducible review separates prediction, communication and response failures; results show sample sizes, geography and limitations; improvements feed the backlog. MET/OBS/PART. |

### Wave 4 — Establish climate services and repeatable revenue

Commercial experiments should be narrow enough to stop without weakening public operations. Customer-specific work must use approved public messages as its authoritative warning reference. Premium support can add interpretation and integration; an earlier or contradictory official warning is not the proposed product.

| Order | Feature and minimum useful scope | Existing basis; dependencies | Release criterion; accountable owner |
|---|---|---|---|
| F34 | **Climate archive and data-rescue programme.** Inventory digital/paper records, metadata, rights and gaps; prioritize ingestion, QC, correction history and backup. | SURFACE/data foundations; F15–F17, FIN rights review. | A selected high-value dataset can be reproduced from originals with units, missingness, station changes and processing recorded. OBS. |
| F35 | **Monthly climate and localized seasonal briefings.** Rainfall/temperature summaries, anomalies where defensible, drought context and regional outlook interpretation. | Existing planned catalogue; CIMH resources; F34. | Qualified reviewer signs calculations, baseline and uncertainty; users can explain the decision implication; insufficient records are not called official normals. OBS/MET/PART. |
| F36 | **Data catalogue and request desk.** Discover datasets, quality, resolution, period, licence, free access and specialist request process; track turnaround and exceptions. | Data service concept exists; F34 and approved rights policy. | A request moves from scope to reviewed delivery with consistent metadata and permitted use; open obligations are honoured. OBS/PM. |
| F37 | **Reviewed historical weather report service.** Versioned evidence packages for planning, incidents and business records with methodology and qualified sign-off. | F09, F34, F36; charge only after F38 approval. | A representative report is independently checked and reproducible; statements distinguish measurements, estimates and interpretation. OBS/MET. |
| F38 | **Commercial service and cost controls.** Approved service boundary, pricing method, quote/contract templates, invoicing route, ownership terms, support limits and severe-weather priority clause. | GAA governance and billing scaffolding; F05, FIN approval. | GAA accepts authority/terms; each offer has cost and capacity assumptions; public-service obligations remain funded and protected. FIN/MET. |
| F39 | **One paid event or tourism pilot.** A named site and event period, briefing cadence, agreed triggers, contact procedure and post-event review. | Local demand must be established; F05, F13, F19, F27, F38. | An independent customer buys or signs a credible paid commitment, uses the advice and evaluates it; staff hours and contribution are measured. PM/MET. |
| F40 | **One paid marine or port pilot.** Tailored operational windows, site interpretation and agreed updates for a suitable marina, port or operator. | F31, F38; demand and data suitability. | Customer decision value and delivery cost are evidenced; the scope avoids unsupported nearshore or underwater predictions. PM/MET/PART. |
| F41 | **Customer service workspace.** Customer sites, contracts, agreed thresholds, briefing archive, requests, named contacts and service commitments. | Reuse common event/product references; F38 and successful F39 or F40. | At least one recurring customer can be served consistently without ad hoc spreadsheets becoming the sole operational record. PM/ENG. |
| F42 | **Commercial performance and renewal review.** Track external revenue, direct delivery costs, forecaster time, unpaid support, receivables, contribution and renewal evidence. | Approved finance process; F38–F41. | Expand only when customers repeat/renew, contribution is credible and public operational performance remains protected. FIN/PM/MET. |

### Wave 5 — Expand selectively after operational and market proof

| Order | Feature and minimum useful scope | Existing basis; dependencies | Release criterion; accountable owner |
|---|---|---|---|
| F43 | **Water and utility decision pilots.** Rainfall/drought briefs, asset exposure and storm preparation timelines with partner operational records. | F26–F27, F33–F35; data-sharing agreement. | Partner demonstrates a useful planning decision; evaluate any predictive outage claim against historical outcomes before operational use. MET/PART. |
| F44 | **Agricultural decision service.** Co-designed planting/dry-spell/rainfall guidance with extension officers; pilot a small crop/location scope. | F31 distribution lessons, F35, partner crop knowledge. | Farmers and extension staff understand uncertainty and act appropriately; agronomic recommendations are jointly reviewed. MET/PART. |
| F45 | **Heat, dust and health support.** Health-partner thresholds, suitable environmental data, population-specific messaging and seasonal briefings. | F26–F27, F35; health authority partnership. | Environmental estimates and measured concentrations are distinct; health advice is approved by the health counterpart. MET/PART. |
| F46 | **Developer API and commercial entitlements.** Versioned access to approved products, clear licences, documentation, quotas, keys and support; add automated billing only when justified. | Public feeds exist; F36, F38, F41–F42. | A real external integration survives versioning and revocation tests; paid access cannot restrict required open/core services; payments reconcile to durable entitlements. ENG/FIN. |
| F47 | **Locally evaluated probabilistic guidance and nowcasting.** Compare external models/ensembles, calibrate suitable variables and trial short-lead products where observations support them. | F17–F19, F33 and science partner. | Held-out evaluation beats an agreed relevant baseline with useful uncertainty; shadow operation and fallback precede service commitments. MET/OBS. |
| F48 | **Flood/coastal/landslide pilot for one justified area.** Combine suitable terrain, hydrological/coastal observations, exposure and expert modelling for a bounded decision. | F26–F29, F33–F34; substantial partner/data prerequisites. | Historical and prospective evaluation supports the claimed location and lead time; limitations prevent unsupported street-level certainty. MET/PART. |
| F49 | **Auditable AI assistance.** Trial retrieval, translation, drafting, structured checks and briefing preparation against approved sources. | Stable workflows/archive and F33. | Meteorologist review is retained for operational output; errors, source attribution and time savings are measured; official issuance is never delegated to unchecked generation. MET/ENG. |
| F50 | **Regional specialist exports and risk partnerships.** Offer proven integration, training, climatology or support services through agreements with peer agencies and specialist organisations. | F38–F42, demonstrated service record and rights. | A funded agreement supports both parties, preserves each jurisdiction's warning authority, and includes sustained support capacity. MET/FIN/PM. |

## Delivery order and realistic capacity

### Integrated climate and service extensions

These eighteen extensions specify value within the original programme. Many are small additions to existing systems. E-identifiers are references, not build-order numbers. Each extension inherits the accountable roles of its parent F-packages; scientific calculations require the designated meteorological/data reviewer.

| ID | First useful feature | Placement and dependencies | Acceptance and expansion gate |
|---|---|---|---|
| E01 | Methods register: algorithm, inputs, units, reference period, completeness, quality, limitations and reviewer. | Begin F01–F02; before automated F35/F37 calculations. | Reviewed methods; identifiable revisions. |
| E02 | Generator library: monthly rainfall product preserving inputs, calculations and outputs. | F34–F35; E01 and accepted data. | Reproduce report; show missing data; expand for repeat use. |
| E03 | Rescue/completeness workbench: originals, scans, gaps, transcription and review tasks. | Inventory F05/F15; implementation F34. | Pilot batch traceable and independently checked; prioritize value/loss risk. |
| E04 | Station investigation: compare time series, flags, intervals and instrument history. | Extend F15–F17 in SURFACE. | Resolve suspect cases without hiding originals or differing intervals. |
| E05 | Controlled manual entry/import: units/times, preview, duplicates and errors. | F16–F17/F34 after existing-capability check. | Repeated/interrupted imports recoverable; rejected rows explained. |
| E06 | Report templates: monthly rainfall/temperature and annual summaries. | F35/F37 after E01–E02. | Alternate staff member generates accepted output without undocumented processing. |
| E07 | Climate atlas/booklets: supported maps, island factsheets, tables and print editions. | F35/F32 with sufficient records. | Each layer states period, coverage and scientifically reviewed limits. |
| E08 | Aviation climatology for an approved use. | F25/F37, E01 and AV applicability review. | Product-specific definitions/requirements; no generic five-year rule. |
| E09 | Event replay: guidance, issues, delivery, observations and reviewed impacts. | F12/F30/F33. | Reconstruct what was known then, distinguishing later evidence. |
| E10 | Seasonal verification: original probabilities, outcomes, baselines and lead/season/location analysis. | Archive F19/F35; evaluate F33. | Reviewed sampling/method; limitations beyond consistency labels. |
| E11 | Practice/competency tools: role tasks, assessors, refreshers and guides. | F04/F25 and every release. | Independent task/failure handling; attendance alone insufficient. |
| E12 | Projection explorer/brief: scenarios, periods, uncertainty and sources. | After F35; local analysis needs science partner/F47. | Distinguish forecasts/projections; verify small-island representation. |
| E13 | Site thresholds: approved versions, justified calculations and counterpart. | F23–F24, F27/F39–F41. | Test units, stale inputs and thresholds; retain decision authority. |
| E14 | Coastal water-level pilot with datum and uncertainty. | Conditional F31/F48; observations and expertise. | Local validation; astronomical tide alone is not storm surge. |
| E15 | Drought/sector calendar: evidence, index timescales, outlook and decisions. | F35/F43–F45 with partners. | Distinguish weather indicators from actual sector impacts. |
| E16 | Extreme rainfall/design-information pilot: assess records, then bounded reviewed report. | F34/F37/F48 and specialist partnership. | Resolution, length and uncertainty support intended professional use. |
| E17 | Offer/value tracking: buyer decision, scope, effort, outcome and repeat work. | F05/F38; automate F41–F42. | Independent use/repeat-purchase evidence and measured costs. |
| E18 | Support/adoption: product/version feedback, triage, owner and follow-up. | F05/F08/F14; every product family. | Measurable improvement in completion or comprehension. |

### CMO evidence library and report intelligence

Implementation slices, records and acceptance scenarios are specified in the [GMS evidence feature brief](../products/gms-evidence-library-implementation.md); delivery placement is recorded in the [client programme plan](../portfolio/gaa-gms-client-programme-plan.md#cmo-evidence-and-reporting-delivery). Proposed output codes are in the [product catalogue](./product-catalogue.md#evidence-and-reporting-products--proposed-extensions). CMO-01–06 refine existing packages and do not change the 68-package count.

Add a proposed internal evidence library using CMO public reports for GMS leadership, forecasters and service planners. Deliver a source-linked Grenada briefing, roadmap gap review and reviewed historical hazard register. This supports existing F01–F02, F04, F26–F27, F33–F34 and E09/E11 scope; it does not add a product family or change programme priorities.

Initial sources, sampled on 10 September 2026: [2025 meeting documents](https://cmo.org.tt/cmc69.html), [2025 operational report](https://cmo.org.tt/docs/CMC69/DMS/DMS2025_Doc_4.pdf), [2024 Directors report](https://cmo.org.tt/docs/CMC69/DMS2024_Final_Report.pdf), [2018 country weather-impact report listings, including Grenada](https://www.cmo.org.tt/cmc58.html), and [CMO projects](https://www.cmo.org.tt/project.html). This is a sample, not a complete archive inventory. Page 3 of the 2025 operational report records Grenada's CAP training and first test message on 18 October 2025; that historical milestone does not establish current operational acceptance.

| Output | Scope | Delivery and acceptance |
|---|---|---|
| Grenada briefing | Grenada references, institutional milestones, regional decisions, commitments, responsible organisations and explicit deadlines. | Manual pilot in R0 under F01–F02. Every finding traces to a source page; reported status remains distinct from current verified status. |
| Roadmap gap review | Map CAP, impact-based warnings, aviation exchange, QMS, observation/radar, training and project findings to existing packages, with proposed action and owner. | Feed F02/F04 and relevant service releases. Verify current authoritative standards and local applicability before adopting requirements; project mentions are leads, not confirmed funding or GMS participation. |
| Historical hazard register | Event dates, hazard, location, reported magnitude/units, impacts and affected sectors; link accounts of the same event while preserving disagreements and missing fields. | Prepare candidates for F26–F27/F33 and E09 in R5; connect reviewed historical records to F34 in R6. Meteorological review precedes operational reuse or public education; narrative reports remain distinct from primary observations. |

Each record retains document title, URL, report date, retrieval date, version/checksum where available, page/section, country, topic, finding and supporting excerpt. Also record proposed action, linked work package, reviewer, review date and status (unreviewed, verified, superseded or rejected). Separate event dates from report dates, preserve original units alongside reviewed normalization, flag OCR uncertainty and detect duplicates. Record access/reuse conditions before republishing documents; restricted or unavailable material remains metadata-only.

Delivery sequence: **source inventory → extraction preview → human review → searchable approved findings → briefing/export**. Search by country, year, hazard and service area with direct evidence references. Begin with a proposed ten-document pilot covering recent operational and Grenada historical material. Acceptance requires all three outputs, review of every pilot finding, reproducible page references and demonstrated duplicate/version handling. Evaluate existing document/search capabilities before adding infrastructure. Automated collection and source-linked drafting follow an accepted pilot; extraction must not directly change warning rules or publish official products.

#### Extracted 2025–2026 evidence and implementation consequences

On 10 September 2026, downloaded and extracted **17 public PDFs, 189 PDF pages: thirteen 2025 documents and four 2026 documents**, from the live CMC69/CMC70 pages. Extraction used pypdf with page boundaries; selected relevant passages were reviewed, rather than a full technical audit of every page. Several PDFs produced recoverable object-offset warnings; tabular facts require visual checking before structured import. The temporary extraction bundle is `/tmp/cmo-report-context-2025-2026/`, with original PDFs, page-separated text and a URL/page-count/SHA-256 manifest; the [durable source inventory](./reports/cmo-2025-2026-source-inventory.json) now preserves retrieval results and checksums in the repository. Source-file storage remains pending.

Coverage:

- **2025:** DMS agenda and notes, operational matters and WMO outcomes (Docs 1a, 1b, 4, 5); CMC agenda and notes, director's report, action status, WMO issues, CMO issues, radar and projects (Docs 1, 2, 3a, 4, 5, 7, 10, 11); and the 32-page DMS2025 final report linked from CMC70. The DMS2025 Doc 2 link returned HTTP 404. Training and strategic-planning listings had no public PDF links.
- **2026:** [DMS agenda](https://www.cmo.org.tt/docs/CMC70/DMS/DMS2026_Doc_1a.pdf) (1 page), [DMS agenda notes](https://www.cmo.org.tt/docs/CMC70/DMS/DMS2026_Doc_1b.pdf) (2), [Council agenda](https://www.cmo.org.tt/docs/CMC70/CMC/CMC70_Doc_1.pdf) (2), and [Council agenda notes](https://www.cmo.org.tt/docs/CMC70/CMC/CMC70_Doc_2.pdf) (5). These concern November 2026 meetings and are preparatory material, not adopted meeting outcomes. The live page has no linked 2026 operational, radar, project or action-status reports yet. Recheck when published; do not mark those reports as extracted.

| Evidence reviewed | Concrete roadmap consequence |
|---|---|
| DMS2025 final report, sections 4.11–4.12: Grenada has a configured regional CAP portal and was testing/validating it. [PDF](https://www.cmo.org.tt/docs/CMC70/DMS2025_Final_Report.pdf) | F11–F12: inventory the existing portal, sender identity, approval authority and regional integration; exercise interoperability and avoid conflicting official issuers. Verify present status with GMS before choosing migration or integration. |
| DMS2025 final report, sections 4.30–4.33: WIS2 transition requires retrieval as well as publication. [PDF](https://www.cmo.org.tt/docs/CMC70/DMS2025_Final_Report.pdf) | Strengthen F18 acceptance above: demonstrate inbound discovery/retrieval, freshness and outage recovery as well as outbound delivery; assign an operational owner and retrieval SOP. |
| DMS2025 final report, sections 2.4–2.6 and 4.18–4.25: regional SURFACE/AWS work, station metadata preparation and continuity of hourly reporting. [PDF](https://www.cmo.org.tt/docs/CMC70/DMS2025_Final_Report.pdf) | F15–F18/F34: reuse SURFACE, validate overnight coverage and metadata, and seek peer implementation lessons. OSCAR/Surface is WMO's station-metadata platform, distinct from the SURFACE CDMS in this repository. |
| CMC69 director's report, page 4: a Grenada presentation evaluated Hurricane Beryl forecast/warning communications at AMS 2025. [PDF](https://www.cmo.org.tt/docs/CMC69/CMC/CMC69_Doc_3a_rev1.pdf) | F33/E09/E11: obtain the underlying presentation as a priority case study for event replay and training. The listing establishes that it was presented, not its findings or recommendations. |
| CMC69 radar report, pages 1–4: Grenada benefits from neighbouring radars; outages, retention and clutter affect service usefulness. [PDF](https://www.cmo.org.tt/docs/CMC69/CMC/CMC69_Doc_10.pdf) | F19/F33: show source age and availability, preserve selected event imagery and validate coverage/QC limitations before interpreting radar as local rainfall evidence. |
| DMS2026 agenda notes, page 2: weather loss/damage reports requested by 5 November 2026; scientific/new-service submissions by 31 October. [PDF](https://www.cmo.org.tt/docs/CMC70/DMS/DMS2026_Doc_1b.pdf) | F33/E09: propose an annual country-report export containing qualitative/quantitative impacts, operational challenges and lessons; F04 tracks preparation and review. Confirm submission instructions before sending anything. |
| DMS2026 agenda, items 4–5: IBF/CAP, aviation QMS/IWXXM, WIGOS/GBON/RBON, WIS2 and competency guidance remain discussion priorities. [PDF](https://www.cmo.org.tt/docs/CMC70/DMS/DMS2026_Doc_1a.pdf) | Keep these topics in F02's applicability review and F04/E11 competency planning. Agenda inclusion does not establish a newly adopted requirement. |
| CMC70 agenda notes, pages 4–5: radar upgrades target Belize and Trinidad and Tobago; communication partnerships and strategic planning remain active regional themes. [PDF](https://www.cmo.org.tt/docs/CMC70/CMC/CMC70_Doc_2.pdf) | F19/F30/F32: assess regional radar benefits and joint media/emergency exercises. Track project relationships separately from any confirmed Grenada allocation. |

Preserve document inconsistencies: the 2026 DMS notes refer to the previous meeting as Trinidad and Tobago, while the 2025 final report identifies Saint Lucia; the CMC70 Doc 2 running header says Doc 1. Use the cover, URL and section together and flag conflicts rather than silently normalizing them. Planned 2026 activities described in 2025 reports need completion evidence before being marked delivered.

### Consolidated release sequence

| Release | User-visible outcome | Included packages |
|---|---|---|
| R0 | Staff know active services, ownership and launch criteria. | F01–F05; E01 methods inventory, E03 records inventory, E18 feedback; CMO-01–03 manual evidence pilot within F01–F02. |
| R1 | A routine forecast reaches the public and remains traceable. | F06–F09; F03/F04 acceptance; one E11 exercise. |
| R2 | Warning issue, receipt, update, cancellation and recovery work end to end. | F10–F14; basic E09 history and E18 feedback. |
| R3 | Staff investigate trustworthy observations and station health. | F15–F18; E04 and missing E05 capabilities; prove WIS2 retrieval independently from publication. |
| R4 | Accepted aviation products/exchange support operations. | F19–F25; E11/E13 and applicable E08. Mandatory deficiencies advance earlier. |
| R5 | Partners/marine users receive local actionable briefings. | F26–F33; extend E09/thresholds with CMO-04–05 reviewed event and annual-report outputs. Coastal modelling is not a core-service prerequisite. |
| R6 | Another staff member reproduces an approved monthly climate report. | F34–F36; E01–E03/E06; E10 archiving where available. |
| R7 | One paid offer demonstrates value, cost and repeat demand. | F37–F42, E17 and service-specific dependencies. |
| R8 | Selected sectors obtain useful climate products and historical maps. | Select F43–F46, E07/E10/E15 by evidence; avoid simultaneous sector launches. |
| R9 | Evaluated advanced/regional services become sustainable. | Conditional F47–F50, E12/E14/E16; continuing E11/E18. |

Release numbering expresses investment order, not a barrier to independent work. Every replacement preserves accepted operations and fallback. A commercial pilot may advance sooner using accepted capabilities and F38 approval, without waiting for unrelated research. Start records preservation and forecast archiving early: missing history cannot be recovered by building a portal later.


The first 90 days should concentrate on a limited accepted service, not all 68 packages. In weeks 1–2, close F01–F02 decisions, inspect the real production topology, choose the initial user journey and start F05 interviews. Identify a small set of operational acceptance scenarios and collect current performance. Begin mandatory aviation-gap remediation immediately where the applicability review finds it necessary.

During approximately weeks 3–6, prioritize F03, the smallest useful F04/F06, and F07–F08. Make one routine forecast issue traceable from duty assignment through publication to public consumption. In parallel only where capacity permits, investigate the observation timing/serial questions and agree the aviation transmission boundary. These investigations should prevent inappropriate architectural work, not become separate large platform projects.

During approximately weeks 7–12, complete the initial archive and CAP delivery/receiver exercise work in F09–F14. Pilot with real staff and a small partner group, record defects and demonstrate continuity. Produce the next release decision from observed service performance. Commercial interviews and a manually prepared offer can proceed, but recurring service commitments depend on the cost/capacity and authority gate.

Those windows are provisional planning envelopes. If production access, staffing, required aviation work or acceptance failures take longer, reduce the number of services launched. With a small team, observations and aviation constitute a substantial next programme; they should not be advertised as a guaranteed three-month addition. Impact, marine and climate services can then advance in bounded releases. Advanced modelling and regional commercialization belong to a multi-year direction, not a dated commitment before resources are known.

Every release should have one named service owner, one operational acceptance lead and one technical maintainer with a trained backup. The same individuals may cover several roles, but their available time must be explicit. Reserve capacity for incident response, maintenance, training and public operations before allocating forecaster hours to sales promises. Avoid launching multiple sector services simultaneously simply because the software can render them.

## Commercial strategy

The strongest initial commercial hypothesis is payment for a specific decision or defensible work product. Generic forecasts face broad alternatives; the local value proposition is authoritative context, traceable evidence, useful integration and access to qualified interpretation. Demand, price and market size remain unverified until buyer research and pilots are completed.

| Priority | Candidate offer | Why it is a plausible starting point | Evidence required |
|---|---|---|---|
| 1 | Historical weather reports and selected data-processing services | Bounded scope; visible deliverable; can be manually priced and reviewed | Adequate records, rights, qualified review, real requests and an approved charging basis. |
| 2 | Event/site weather briefings | Clear decision window and accountable organiser; can pilot one event | Buyer willingness to pay, agreed thresholds, staffing during severe weather, and a usable post-event assessment. |
| 3 | Marina/port/operator support | Builds on core marine expertise and recurring operational windows | Suitable local marine guidance, repeat demand, support burden and clear decision responsibility. |
| 4 | Utility/water support | Potential operational value from preparedness and seasonal planning | Partner data, history, buyer budget, measurable decisions and shared evaluation. |
| 5 | Climate/planning consultancy with specialist partners | Potentially valuable specialist interpretation | Sufficient records, competence, defensible methods and controlled professional scope. |
| Later | APIs, regional managed services and advanced risk analytics | Scalable only after the service and data contracts are stable | Repeated demand, rights, durable support and unit economics; no assumed automatic software margins. |

For each pilot, define the buyer, decision, geography, hazards, issue frequency, working hours, urgent contact route, delivery channels, data limitations, responsibility and review date. Obtain evidence from independent customers; internal project entities or GAA allocations should not by themselves be counted as proof of an external market.

Use a transparent costing model: **delivery labour + data/communications + support + allocated maintenance and overhead + risk allowance**, then compare the resulting offer with willingness to pay and alternatives. Track contribution after direct delivery costs alongside the broader fully allocated cost picture. No supported evidence currently establishes Grenada-specific market prices or total addressable revenue, so numerical revenue forecasts would be premature.

Begin with GAA's approved quote, contract and invoice process. Automating Stripe checkout before service terms, entitlement persistence, reconciliation and applicable payment arrangements are settled would create a storefront before an operating business. The commercial workspace should follow proven repeat work, and self-service billing should follow a justified volume of transactions.

Public warnings, core public safety information and relevant international data obligations should not depend on payment status. Commercial growth should fund better observation maintenance, service continuity, training and specialist capacity under an approved allocation policy. Revenue that consumes scarce duty expertise while degrading the mandate is not successful product growth.

## Funding, partnerships and procurement

SOFF's country information lists Grenada for readiness support, and its programme distinguishes readiness, investment and compliance phases. This is a concrete lead for GMS leadership to verify with the national focal point, not evidence of an approved investment grant or a budget available to this project. Confirm existing programme documents and counterpart responsibilities before commissioning overlapping diagnostics.[^30]

CIMH is a natural first discussion for climate products, verification, training and specialist support. WMO's Country Hydromet Diagnostics approach provides a broader institutional maturity lens than counting application features; it can help structure evidence on service gaps and capacity. WMO also reports ongoing Caribbean impact-based forecasting work, making regional learning a practical avenue to investigate without assuming GMS has participated in a particular programme.[^9][^31][^32]

Procure missing capabilities after identifying the limiting service problem. A lightning feed, station replacement, communications backup or specialist training may create more operational value than another dashboard. Compare whole-life cost, coverage, interoperability, data/export rights, outage behaviour, support and local maintainability. Grant-funded capital should have an explicit plan for recurring communications, calibration, spare parts and staff time.

Use external global models and established regional guidance before investing in local modelling infrastructure. Consider ClimWeb and other open-source capabilities through a focused fit-gap exercise: what important requirement is still unmet, what can be reused safely, and what is the migration and support cost? The reviewed repository already has substantial functionality, so replacement requires evidence of a better lifecycle outcome.

## Architecture and reuse decisions

### Scientific product acceptance

Specify each product's user decision, spatial/temporal support, datasets, units, observation intervals, method, eligible quality states, baseline, completeness rules, uncertainty and reviewer. Show users metadata needed for interpretation and retain complete calculation evidence internally.

For the first monthly rainfall report, verify complete/missing months, duplicate import, relevant instrument/reset behaviour, corrections and local/UTC boundary cases against independently reviewed calculations. Establish whether amounts cover preceding intervals, local reporting days or another explicit period. Tests must verify meteorological meaning, not simply execution.

Raw observations, reviewed records, homogenized series, interpolated estimates and model/reanalysis values are distinct scientific objects. Preserve originals and identify every adjustment/gap-filling method. Record exactly which version a published report used; decide when material corrections require a revised product or customer notice.

WMO climatological standard normals use thirty-year reference periods. Shorter records can support carefully described statistics, but not that standard-normal label. Completeness and methodology also matter.[^38] Aviation statistics require their own applicability review, not a generic minimum copied from an earlier summary.

Seasonal evaluation must retain original probabilities, issues, periods and model versions. Agree baselines and separate fitting from evaluation data. Account for overlapping seasons, limited samples and model changes. The interface should support scientifically appropriate metrics rather than encode one consistency label as proof of skill.

Projection products must show scenario, horizon, baseline, dataset and uncertainty. Fine grids are not evidence of local accuracy. Engineering design, return-period statements and inundation estimates require separately reviewed methods and professional scope; data suitable for broad communication may be inadequate for site design.

### Research-to-service gates

Move each research idea through user-decision definition, data rights/fitness, scientific validation, shadow operation, staff/maintainer assessment and authorized pilot with fallback. Stop trials that add no meaningful skill/user value or cannot be sustained.

The developer-meteorologist role is especially valuable in defining scientific meaning, building reproducible generators and translating decisions into product behaviour. Arrange independent review and a second capable maintainer; public operations should not depend on one person's availability.

Use Python and the existing application stack where suitable. Add R or another specialist component for a validated method/integration, not because the earlier discussion listed it. No Java requirement has been established. Promote accepted scientific prototypes into supported generators, with clear request/status/result workflows for long-running work.


Keep operational authorship in the existing GAA-admin product desk and CAP service, with explicit integration references rather than an immediate database merger. Keep the public GMS application focused on clear published information. Use the editorial CMS for evergreen content and preparedness material, not as an alternate authority for warning status.

Retain SURFACE and wis2box as their distinct observation/exchange systems. Define versioned interfaces, provenance and monitoring around their boundaries. Reuse existing station assets and QC before adding a competing subsystem. Likewise, reuse existing shared authentication and HR for staff identity, adding operational competence and duty context where necessary.

The central product concepts to standardize are service/product definition, scheduled issue, issued revision, hazard event, observation provenance, delivery attempt, partner decision and customer service agreement. Their meanings should remain consistent across interfaces. They need not all be implemented in one database or a newly introduced microservice estate.

A public archive should expose approved issue history, while an internal audit preserves drafts, actor information and process evidence. A customer portal should reference the same authoritative public warning while adding the customer's agreed analysis and workflow. This reduces contradictions and preserves a clear line from source evidence to official communication.

## Measures of world-class performance

World-class status should be earned through evidence. No single overall ranking or website metric captures operational quality. Set service-specific targets after baseline measurement and approval; the measures below are proposed management indicators, not international numerical requirements.

| Dimension | Measure | Interpretation safeguard |
|---|---|---|
| Service dependability | Expected issues delivered on time; publication and channel latency distributions; outage duration | Count every expected issue, including missing/withdrawn occurrences with reasons; report availability separately from correctness. |
| Warning effectiveness | Lead time, detection/miss/false-alarm measures, reach, comprehension and partner action | Define events and thresholds; do not optimize for more alerts or suppress misses through selective reporting. |
| Aviation quality | Issue punctuality, correction reasons, exchange failures, forecast verification and findings closure | Use the aviation lead's approved evaluation methods and applicable requirements. |
| Observation health | Timeliness, availability, QC flags, unresolved incidents and calibration/maintenance status | A received record may still be poor quality; absence of a flag is not proof of accuracy. |
| Forecast skill | Appropriate error/skill and probabilistic scores by variable, lead time, place and season | Compare with relevant baselines; show sample size, uncertainty and data gaps. Few cyclone cases cannot support sweeping claims. |
| Inclusive access | Outer-island coverage, low-bandwidth usability, accessibility and understanding across user groups | Page views alone do not establish warning receipt or comprehension. |
| Institutional resilience | Exercised fallback, restore evidence, trained backup coverage and overdue corrective actions | A backup job's success does not demonstrate full service restoration. |
| Commercial health | Independent paying customers, repeat purchases, contribution, staff hours, receivables and renewal | Separate grants/internal allocations from external sales and protect public-service performance. |

Publish an understandable public service-performance summary once measures are stable. Keep sensitive operational detail in the internal review. After significant events, review forecast quality, communication, partner decisions and observed impacts together, record limitations and assign corrective work. This learning cycle is part of the product, not an optional communications activity.

## Decisions that could change the order

### Product discovery register

Resolve questions relevant to the next release and record evidence; do not delay all work until every future question is answered.

| Decision | Questions | Required outcome |
|---|---|---|
| User/outcome | Who uses it, for which decision? What workaround and failure consequence exist? | Journey, baseline and measurable benefit. |
| Coverage | Which islands/zones/sites/users are supported or excluded? | Explicit scope and unavailable states. |
| Product contract | What issue schedule, validity, amendments and channels apply? | Approved definition and occurrence ledger. |
| Scientific fitness | Which inputs/methods, baselines and completeness rules support the claim? | E01 and scientific acceptance evidence. |
| Rights | Who owns inputs? What may be shared, published or charged for? | Dataset-specific rights decision. |
| Reuse | Is it already in SURFACE, CAP, WxProducts, regional products or live operations? | Reuse/integrate/build decision and lifecycle cost. |
| Ownership | Who prepares, reviews, issues, maintains and covers absence/out-of-hours? | Accountable owner and feasible duty coverage. |
| Delivery | Which channels reach users; what do their receipt states actually prove? | Receiver test and fallback. |
| Comprehension | Can users understand place, timing, uncertainty and action on their devices? | Representative usability results. |
| Verification | Which baseline, matching observations and sample limitations apply? | Reproducible evaluation and review date. |
| Commerce | Who buys which extra value, with what support/cost/terms? | Bounded offer and demand evidence. |
| Continuity | Can the team handle a major event/absence; can another person restore service? | Allocated capacity and exercised contingency. |
| Adoption | What training/partner practice/support changes user outcomes? | Competency and adoption plan. |
| Expansion | What evidence justifies coverage, automation or procurement; when stop? | Investment gate and transition/export plan. |

### Additional value worth including

Prioritize records preservation, reusable media syndication, technical event reconstruction, practical training and independent method review. Investigate observation-maintenance support and regional integration services through suitable partnerships. These may increase public reach, lower costs or create specialist income without a new major application.

Impact reporting should start with trained partners and moderation. Capture observation time/place, evidence and confirmation status. A later public submission feature must protect personal information; an uploaded photograph is evidence to assess, not an automatic trigger for an official warning.

Education/research partnerships can provide supervised projects, method review and workforce development while GMS retains operational ownership. Regional support and open-source work need clear rights, maintenance and funding. Staff capability is a recurring service cost.

Begin rescue of at-risk records before the full climate portal. WMO's updated guidance addresses original media, imaging, digitization and preservation.[^39] A small checked collection has more analytical value than a large scanning campaign without structured, verified data.

### Interpretation of the Pacific material

The supplied content is a previous analysis referring to NIWA_PacificClimateServiceEvalResults_2025.pptx; the original was not inspected. Attributed survey findings, requested enhancements and exhaustive inventory claims remain unverified. Treat them as discovery leads, not established Grenadian demand or confirmed NIWA evaluation results.

Primary sources independently support product generators, regional climate services, practical technician training, rescue and competencies.[^33][^34][^37][^39][^40] Adopt these lessons selectively. Do not infer a need to install CLiDE, NEON, SCOPIC or a multinational platform merely because those names were listed.

SCOPIC is broader than drought monitoring: Bureau of Meteorology research describes a statistical seasonal forecasting system.[^41] A generic five-year climate reference, Java stack and universal microservices requirement are not accepted requirements. Scientific suitability, current obligations, local demand and sustainable cost govern the choices.


| Unknown | Who should resolve it | Effect on the roadmap |
|---|---|---|
| Current legal mandate, charging authority and approvals | GAA leadership and legal/finance | Determines viable commercial structure and contract timing. |
| Current aviation designation, exchange arrangements and applicable requirements | GMS aviation lead and relevant authority | Can move F20–F25 or particular controls to the immediate priority. |
| Actual production topology and what is already operated outside this repository | Operational and technical owners | Prevents replacing functioning services or claiming gaps that are already met externally. |
| Approved schedules, review rules and emergency fallback | MET/AV | Defines F01, F06 and acceptance scenarios. |
| Qualified staff availability and engineering capacity | GMS/GAA management | Determines release size, support hours and commercial capacity. |
| Sensor inventory, calibration, data rights and source costs | OBS/FIN | Determines feasible observations, lightning, marine and API products. |
| Historical record completeness and metadata | OBS | Determines report, normals and consultancy scope. |
| Partner decision thresholds, exposure data and response authority | Emergency/sector counterparts | Determines responsible impact warnings and operational decision support. |
| Independent willingness to pay | PM/FIN with customers | Determines which commercial pilot advances; may change the proposed order. |
| Existing SOFF/CREWS or other funded programmes | National programme focal points | Changes procurement and capacity opportunities without assuming new money. |

Defer a proprietary global weather model, satellite programme, broad native-app suite, insurance underwriting, generalized autonomous warning generation and speculative national fine-resolution hazard claims. Wider GAA HR, payroll and unrelated portfolio applications should advance only where necessary to support this GMS scope. The next implementation commitment should be a small accepted operational release, with the remainder of this roadmap reviewed against evidence at each gate.

## Project evidence index

Repository review reference: HEAD `055bdce3`; working tree unchanged during analysis. Paths below are local project evidence, not claims of deployment.

- [GAA/GMS client programme plan](../portfolio/gaa-gms-client-programme-plan.md), [service catalogue](service-catalogue.md), [product catalogue](product-catalogue.md), and [stakeholder research plan](stakeholder-research-plan.md): institutional scope and drafted product breadth.
- [GMS product operations](../operations/gms-products.md) and [authored product queries](../../apps/web/gaa-admin/src/db/wxproducts/authored-queries.ts): actual publication semantics, schedules, revisions and public feed limits.
- [Dashboard schedule logic](<../../apps/web/gaa-admin/src/app/(admin)/_components/home-data.ts>) and [dashboard loaders](<../../apps/web/gaa-admin/src/app/(admin)/_components/home-loaders.ts>): current completion calculation.
- [CAP worker dispatch](../../apps/api/fastapi/src/worker/dispatch.py) and [publishers](../../apps/api/fastapi/src/worker/publishers.py): result handling, delivery/rendering and skipped publisher behaviour.
- [Public weather snapshot](../../apps/web/gms/src/lib/weather-snapshot.ts), [editorial data](../../apps/web/gms/src/lib/editorial.ts), and [CAP presentation](../../apps/web/gms/src/lib/cap.ts): public data sources and presentation boundaries.
- [Sutron collector](../../scripts/sutron-collector/README.md), [SURFACE tasks](../../surface/api/wx/tasks.py), [SURFACE quality-control guidance](../../surface/api/wx/quality_control/QualityControl.md), and [integration roadmap](integration-roadmap.md): observation processing and exchange boundaries.
- [NHC ingestion](../../scripts/gms-ingest/README.md) and [WxWatch image utilities](../../apps/web/gaa-admin/src/lib/wxwatch/utils.ts): guidance ingestion and existing proxy support.
- [Production baseline](../operations/production-baseline.md), [release verification](../operations/gms-release-verification.md), and [interaction acceptance](../operations/admin-gms-interaction-acceptance.md): staff baseline and differences between recorded checks and pending acceptance.
- [Aviation compliance plan](../operations/aviation-compliance-plan.md), [warning framework](../operations/warning-ibf-framework.md), and [quality framework](../operations/quality-verification-framework.md): drafts to reconcile with current requirements and approved local policy.
- [Billing service](../../apps/api/fastapi/src/billing/service.py) and [billing routes](../../apps/api/fastapi/src/billing/router.py): checkout/webhook scaffolding and limits of commercial readiness.

## Sources

All web sources accessed 10 September 2026. Undated pages are identified by publisher and title; dynamic vendor pages describe advertised capabilities. Recommendations, feature priorities, acceptance gates and staffing assumptions are this report's analytical proposals.

[^1]: Grenada Meteorological Service. [History / Background](https://www.weather.gd/history-background/). Undated institutional page; indexed text reviewed; direct retrieval was unavailable.
[^2]: Parliament of Grenada. [Airports Authority Act, Cap. 12](https://grenadaparliament.gd/wp-content/uploads/2021/08/Cap12-AIRPORTS-AUTHORITY-ACT.pdf). Published compilation; amendments shown through 2008; current consolidation not established.
[^3]: WMO. [Early Warnings for All](https://wmo.int/all-activities/build-resilience/early-warnings-all). Programme framework, including the four pillars.
[^4]: NOAA National Weather Service. [Impact-Based Decision Support Services](https://www.weather.gov/about/idss). Agency service approach.
[^5]: UK Met Office. [Commercial aviation services](https://www.metoffice.gov.uk/services/transport/aviation/commercial). Service description.
[^6]: UK Met Office. [Event management services](https://www.metoffice.gov.uk/services/business-industry/event-management). Service description.
[^7]: MetService. [Roles and responsibilities](https://about.metservice.com/about-us/roles-and-responsibilities). Public-service responsibilities; institutional restructuring considered separately.
[^8]: MetService. [Statement of Corporate Intent 2025](https://about.metservice.com/assets/Company-documents/SCI-2025-web.pdf). June 2025, FY2026–28 strategy and transition context. Earth Sciences NZ. [Statement of Corporate Intent](https://www.earthsciences.nz/about-us/statement-of-corporate-intent). Current institutional planning page.
[^9]: CIMH. [Caribbean Regional Climate Centre](https://rcc.cimh.edu.bb/). Regional climate products and services.
[^10]: NOAA National Hurricane Center. [About NHC forecast graphics](https://www.nhc.noaa.gov/aboutnhcgraphics.shtml). Product interpretation and geographic applicability must be checked per product.
[^11]: Meteorological Service Singapore. [Lightning Information Service](https://www.weather.gov.sg/lightning/). Detection information, age and domain presentation.
[^12]: Tomorrow.io. [Weather intelligence platform](https://www.tomorrow.io/weather-intelligence-platform/). Vendor-described protocols and operational workflow.
[^13]: DTN. [Storm Risk](https://www.dtn.com/weather/utilities-and-renewable-energy/storm-risk/). Vendor-described utility decision support.
[^14]: Vaisala. [Services for weather applications](https://www.vaisala.com/en/services/services-for-weather-applications). Vendor-described maintenance and lifecycle services.
[^15]: Meteomatics. [Energy industry services](https://www.meteomatics.com/en/energy-industry/). Vendor-described sector data applications.
[^16]: EUROCONTROL. [Adverse weather management](https://www.eurocontrol.int/service/adverse-weather-management) and [Airport collaborative decision-making](https://www.eurocontrol.int/concept/airport-collaborative-decision-making). Operational coordination references, not Grenadian requirements.
[^17]: Esri. [Risk reduction and prevention](https://www.esri.com/en-us/industries/humanitarian/solutions/risk-reduction-prevention). Hazard/exposure/vulnerability information pattern.
[^18]: CCRIF SPC. [About CCRIF](https://www.ccrif.org/fr/node/7?language_content_entity=en). Organisation and risk-product context.
[^19]: ECMWF. [Open data](https://www.ecmwf.int/en/forecasts/datasets/open-data). Dataset access and licensing context.
[^20]: WMO. [ClimWeb wins United Nations 2.0 Innovation Awards](https://public.wmo.int/media/news/climweb-wins-united-nations-20-innovation-awards). 19 June 2026. Platform capabilities and open-source approach.
[^21]: WMO. [ICAO publishes new editions of Annex 3 and PANS-MET](https://wmo.int/media/news/aviation-news-2025-09-05-icao-publishes-new-editions-of-annex-3-and-pans-met). 5 September 2025. Publication editions and applicability date; full controlled texts were not reviewed.
[^22]: ICAO. [Manual on the ICAO Meteorological Information Exchange Model, Doc 10003](https://store.icao.int/en/manual-on-the-icao-meteorological-information-exchange-model-doc-10003). Official manual description; not a clause-level audit.
[^23]: WMO. [Guide to Instruments and Methods of Observation, WMO-No. 8](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/instruments-and-methods-of-observation-programme-imop/guide-instruments-and-methods-of-observation-wmo-no-8-0). Edition-specific application must be confirmed by the observation lead.
[^24]: WMO. [Guide to WIS 2.0](https://wmo-im.github.io/wis2-guide/guide/wis2-guide-APPROVED.html). Approved guide.
[^25]: WMO. [WIGOS Data Quality Monitoring System](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/wmo-integrated-global-observing-system-wigos/implementation-of-wmo-integrated-global-observing-system-wigos/wdqms-wigos-data-quality-monitoring-system). Monitoring framework.
[^26]: WMO. [Unified Data Policy Resolution](https://public.wmo.int/wmo-unified-data-policy-resolution-res1). Core/recommended data distinction and implementation through regulatory material.
[^27]: WMO. [Guidelines for Implementation of CAP-Enabled Emergency Alerting, WMO-No. 1109](https://etrp.wmo.int/pluginfile.php/17980/mod_resource/content/1/wmo_1109_en.pdf), including section 4.7; [Register of Alerting Authorities](https://alertingauthority.wmo.int/). GMS's current registration was not established.
[^28]: WMO. [Climate services framework](https://wmo.int/activities/climate-services/more-climate-services) and [Climate Services Toolkit](https://wmo.int/activities/climate-services-toolkit). Service components and supporting resources.
[^29]: WMO/HMEI. [Code of Ethics guiding public-private engagement](https://public.wmo.int/wmo-hmei-code-of-ethics-guiding-public-private-engagement). Partnership principles.
[^30]: SOFF. [Countries](https://www.un-soff.org/operations/countries/), [Frequently asked questions](https://www.un-soff.org/frequently-asked-questions/), and [Readiness programming decision](https://un-soff.org/wp-content/uploads/2024/05/Decision-8.7-SOFF-Readiness-Programming.pdf). Grenada programming is not evidence of a project investment award.
[^31]: WMO. [Hydromet Gap Report 2024](https://wmo.int/resources/publication-series/hydromet-gap-report/hydromet-gap-report-2024). Country Hydromet Diagnostics and institutional capability context.
[^32]: WMO. [Caribbean countries strengthen impact-based forecasting and warning services ahead of the 2026 hurricane season](https://public.wmo.int/media/project-update/caribbean-countries-strengthen-impact-based-forecasting-and-warning-services-ahead-of-2026-hurricane). 2026 project update; no inference of GMS attendance or funding.

[^33]: Earth Sciences New Zealand / NIWA. [Climate Data for the Environment Services Client](https://niwa.co.nz/pacific/climate-data-environment-services-client-clidesc). Product-generator architecture; not proof of suitability for a GMS migration.
[^34]: CIMH Caribbean Regional Climate Centre. [Climate bulletins archive](https://rcc.cimh.edu.bb/climate-bulletins-archive/) and [Drought bulletin product information](https://rcc.cimh.edu.bb/product-sheets/drought-bulletin). Indexed archive entries reviewed where direct retrieval timed out.
[^35]: WMO. [Global Producing Centres for Long-Range Forecasts](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/climate-services/global-producing-centres-long-range-forecasts). Verification reference; historical terminology/centre counts not used as GMS obligations.
[^36]: Copernicus Climate Change Service. [Interactive Climate Atlas guide](https://climate.copernicus.eu/copernicus-interactive-climate-atlas-guide-powerful-new-c3s-tool). 16 February 2024, updated May 2025; dataset/scenario/uncertainty presentation.
[^37]: WMO. [Competency-based training for climate services](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/climate-services/competency-based-training). Distinct from Secretariat staff behavioural competencies.
[^38]: WMO. [Climatological normals](https://wmo.int/wmo-climatological-normals). Definitions and calculation guidance; eligibility requires review.
[^39]: WMO. [WMO updates guidelines on data rescue](https://public.wmo.int/media/news/wmo-updates-guidelines-data-rescue). 27 May 2024; WMO-No. 1182 update.
[^40]: Earth Sciences New Zealand / NIWA. [Training Fiji's Meteorological Technicians](https://niwa.co.nz/news/training-fijis-meteorological-technicians). 19 November 2025; practical training/assessment, not the original evaluation presentation.
[^41]: Australian Bureau of Meteorology / CAWCR. [Seasonal Forecast Verification in the Pacific using a coupled model POAMA and the statistical model SCOPIC](https://www.bom.gov.au/research/publications/cawcrreports/CTR_067.pdf). Historical research for tool scope, not current support or Grenadian forecast skill.
