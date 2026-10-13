# Public forecast quality and WMO guidance

**Status:** Implementation audit; operational definitions pending GMS approval

**Owner:** GMS (forecast practice); maintained by Barrels Grenada

**Last updated:** 2026-10-12

Scope: morning, midday and evening public forecasts in the weather-product desk.
This audit distinguishes editing checks, publication review and verification
against observations. Passing validation establishes usable content; it does
not establish forecast accuracy or WMO conformity.

WMO distinguishes mandatory standard practices, recommended practices and
implementation guidance. Applicable requirements depend on the service and
product. Public narrative forecasts must not be treated as METAR/TAF, BUFR or
IWXXM messages merely because they share weather variables. See WMO's
[Standards and Recommended Practices](https://wmo.int/about-us/governance/technical-commissions/standards-and-recommended-practices).

## Implemented safeguards

| Concern | Current behavior and evidence |
| --- | --- |
| Identity and coverage | FastAPI stamps the authenticated forecaster and fixed Grenada, Carriacou and Petite Martinique coverage. Client values are not trusted for identity. |
| Time | Grenada UTC−04:00 is explicit. Scheduled issue times are 07:00, 12:00 and 18:00; validity and evening dates are derived from the selected issue date. These are GMS schedules, not WMO-prescribed hours. |
| Numeric content | Non-finite and malformed numbers are rejected. Probability fields are bounded 0–100; wind, waves, swell and tides have defensive domain ranges. These bounds are application checks, not WMO thresholds. |
| Consistency | Minimum must not exceed maximum for temperatures in every period, wind speeds and wave heights. Gusts cannot be below entered sustained wind speeds. Evening structured parameters are checked per day, including days hidden by the editor tabs. |
| Units | Editor mph/ft values convert to canonical knots/metres; temperature remains Celsius. Untouched values retain their precision. Units stay explicit in the text summary; existing PDF layouts are retained. |
| Publication | Incomplete drafts are allowed. Validate and preview checks the complete normalized product; publishing revalidates it, checks authorization and requires human review. Edits invalidate the browser's review approval. Expired products cannot be published. |
| Traceability | Saved revisions preserve content, actor, action, time and revision note. Draft changes do not replace the public snapshot. Conflicting revisions are rejected; withdrawal retains history. Scheduled issue time and actual publication time are separate. |
| Preview integrity | Live text follows current values. PDF rendering is explicit, and a retained older PDF is marked when changes are pending. Rendering success grants no publication readiness by itself. |

Backend evidence is in `validation.py`, `units.py` and `service.py` under
`apps/api/fastapi/src/wxproducts/`; regression tests are in
`apps/api/fastapi/tests/wxproducts/`. Editor, conversion and review tests are in
`apps/web/gaa-admin/src/components/wxproducts/` and `src/lib/wxproducts/`.

## Operational definitions still needed

GMS must approve and document the meaning of rain chance: the event threshold,
location or area and accumulation window. Do not infer it from percentage area
coverage or import another country's precipitation threshold. WMO guidance calls
for clearly defined probabilities and language that users can interpret:
[Communicating Forecast Uncertainty for Service Providers](https://wmo.int/resources/bulletin/vol-57-4-2008/communicating-forecast-uncertainty-service-providers).

The same review must establish temperature location and extrema windows,
wind averaging period and reference height, gust duration, wave-height meaning,
tide station and vertical datum, and the date/location for sunrise and sunset.
Astronomy times currently remain legacy text; they are not checked against an
astronomical calculation. Tide heights cannot be scientifically verified without
a datum. Sea-state categories do not justify forcing a wave-height range without
agreeing whether that height describes wind waves, swell or combined seas.

WMO's [Marine Services FAQ](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/marine-services/frequently-asked-questions)
recommends wave heights for forecasts rather than relying on sea-state categories.
The current forecasts include quantitative wave-height fields alongside the
categories; the category reference follows code table 3700. GMS should confirm
the height definition and operational wording before adding cross-field limits.

## Verification against observations

GMS confirmed that public forecast minimum/maximum temperatures describe
national conditions, not MBIA-specific predictions. The first planned observation
point is MBIA, using approved manual station records supplied through eRegister
once that work is ready. eRegister is still under development; this audit does
not establish a functioning observation feed or change its implementation.
Station comparisons must explicitly identify their representativeness limits;
do not relabel the national forecast as an MBIA station forecast. Hourly METAR
temperatures must not substitute silently for recorded daily extremes.

The system exposes legacy observations and immutable forecast revisions, but
does not yet match public forecasts to observations or produce accuracy/skill
scores. Available observation provenance does not itself establish measurement
quality. WMO supports objective, consistent verification and retaining results
to identify improvements. Its centre-specific verification procedures are not
automatically requirements for this public forecast editor. See
[WMO Forecast Verifications](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/wmo-integrated-processing-and-prediction-system-wipps/forecast-verifications)
and [WIPPS](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/wmo-integrated-processing-and-prediction-system-wipps).

A future verification implementation needs a GMS-approved observation source
and matching specification first. Match the forecast revision actually issued
before the event to its location, variable, units, validity window and lead time.
Late publications or revisions must not create retrospective skill. Preserve
observation source, quality flags, matching decisions and excluded/missing data;
missing observations are not zero rainfall or a correct forecast.

Candidate methods for operational review include temperature bias/MAE/RMSE,
rain-probability Brier scores and reliability diagrams, and categorical event
contingency tables. Method selection, event definitions, reference forecasts,
sample-size reporting and uncertainty must be agreed before implementing or
publishing scores. Report results by product, period, lead time and location;
MBIA station results alone cannot substantiate national forecast accuracy.
No acceptance targets or skill scores are introduced by this audit.

The [quality framework](quality-verification-framework.md) remains a draft of
operational goals, not implemented automation or a statement of WMO-mandated
targets. [GMS authored products](gms-products.md) is the active schedule reference.
