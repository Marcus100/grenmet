# ADR-0056: Reuse ideas from the WMO Regional Office for Africa open-source tools; port, never adopt whole

## Status

Accepted — 2026-11-13 (owner). Nothing here is built yet; each item is its own
GitHub issue and is scheduled separately. Builds on ADR-0010 and ADR-0032
(publishing observations to the WMO exchange), ADR-0054 (warning desk),
ADR-0029 (organisation API keys) and ADR-0015 (backend logic is Python in
FastAPI).

## Context

The World Meteorological Organization's Regional Office for Africa publishes
about 95 public repositories at <https://github.com/wmo-raf>. They are the
working tools of some thirty African national weather services: a website
system (ClimWeb), a warning composer (CAP Composer, for the Common Alerting
Protocol, the international warning format), an observation collector (the
Automated Data Loader), a monitor for the WMO data exchange (WIS2Watch) and
many small helpers.

We already took from this family once: `apps/api/fastapi/src/cap` is a port of
CAP Composer. The question is what else is worth taking, for the Grenada
Meteorological Service work and for Barrels Grenada products in general, and
on what terms.

## Evidence

- **Facts:** every README was read, and the code of the 15 repositories that
  touch our work was read at the level of structure and key modules, not line
  by line (2026-11-13). High.
- **Facts:** all of their applications are Django and Wagtail with Celery
  workers. Ours is a FastAPI modular monolith with an ARQ worker and Next.js
  front ends (ADR-0015). High.
- **Facts:** licences vary. MIT: `adl`, `cap-composer`, `wis2watch`,
  `geomanager`, `climweb`. No licence file: `adl-collector-app-plugin`,
  `cap-aggregator`, `tropycal-api`, `climweb-wdqms`, `forecastmanager`,
  `adl-agent`, `django-task-ferry`. `cap-oet` is mixed: code MIT, icons from the
  United Nations humanitarian icon set and Font Awesome Free (attribution
  required), event terms from the OASIS standard. High.
- **Facts:** we already have several things they have. Our warning desk signs
  its XML (`src/cap/sign.py`) and validates areas (`src/cap/validation.py`);
  eRegister already uses the `pymetdecoder` and `csv2bufr` libraries. High.
- **Facts:** `src/cap/tasks.py` lists a `publish.wis2box` job as "skipped"
  until the local wis2box is live. CAP Composer publishes a warning to a
  wis2box with one message on the topic `wis2box/cap/publication` carrying the
  XML (base64), a file name and the dataset's metadata identifier
  (`cap/mqtt/publish.py`). High.
- **Facts:** the Automated Data Loader sends automatic station data to a
  wis2box as hourly CSV files in the official "AWS template", uploaded to the
  `wis2box-incoming` bucket (`core/dispatchers/`). It runs four automatic
  checks on incoming values: range, step change, stuck sensor and spike
  (`core/qc/validators.py`), and has a service that finds missing hours and
  refetches them (`monitoring/gap_service.py`). High.
- **Facts:** WIS2Watch's own decision record 2 reports that alerting on "down
  for five minutes" produced about 710 emails in one week from one flapping
  connection; they now alert on the share of time down. High.
- **Interpretation:** their domain rules and message formats are the valuable
  part; their code is tied to Wagtail and would not run in our stack without a
  second framework. Heuristic. High.
- **Interpretation:** no Caribbean weather service appears in their adoption
  lists; the tools and their support are aimed at Africa. Speculation that
  this leaves room for Barrels in the Caribbean. Low.
- **Uncertainty:** the make and model of the automatic station at 78958 is not
  confirmed, so which of their vendor connectors is relevant is unknown.
  WIS2Watch and the warning aggregator are both marked "under development".
  Medium.

## Options considered

1. **Run their applications beside ours** (for example ClimWeb for the public
   site, the Automated Data Loader for stations). Fastest to a demo. Adds a
   second framework, a second sign-in, a second database and a second upgrade
   path on servers that are already memory-constrained; duplicates eRegister,
   the warning desk and SURFACE. High operational cost.
2. **Ignore them.** No cost, but we would re-derive message formats and
   checks that thirty services have already tested in operation.
3. **Port ideas and formats into our own domains (chosen).** We keep one
   stack. Costs engineering time per item and needs care with licences.
4. **Depend on their Python packages directly.** Only `cap-oet` is
   packaged for this, and it pulls in Django templates we do not use. Rejected
   in favour of copying its data and icons with attribution.

## Decision

1. **Port, never adopt whole.** No WMO Regional Office for Africa application
   is deployed on Barrels servers, and none becomes a runtime dependency.
2. **Licence rule.** From MIT repositories we may port code with the copyright
   notice kept. From repositories with no licence we take ideas and public
   formats only and write our own code. Third-party assets keep their own
   attribution. Their "WMO accepts no liability" notices do not transfer; we
   state our own.
3. **Recommended for the Grenada Meteorological Service, in this order:**

   | # | What to build | Taken from | Where it goes | Depends on |
   | --- | --- | --- | --- | --- |
   | 1 | Publish each issued warning to the WMO exchange through our wis2box, using the one-message format above | `cap-composer` | `src/cap` worker job `publish.wis2box` | Local wis2box live (owner decision 2026-10-30) |
   | 2 | Standard event term on every warning (the 224 OASIS terms), with one icon per term on the desk and public pages | `cap-oet` | `src/cap` catalogue and `apps/web/cap` | GMS approval; `catalogue.py` is not approved event codes today |
   | 3 | Missing-hour view per station, with a "check the source and recover" action | `adl` gap service | observations domain (ADR-0032) and eRegister | ADR-0032 built |
   | 4 | Four automatic checks on automatic-station values: range, step change, stuck sensor, spike. Warn only, never block | `adl` checks | observations domain (ADR-0032) | ADR-0032 built; thresholds from GMS |
   | 5 | Daily pull of the WMO delivery figures for 78958 (did each main-hour report arrive at the four monitoring centres) shown on the Met office dashboard | `climweb-wdqms` (idea; public WMO download) | worker job and `gmsdash` | 78958 publishing |
   | 6 | Extra warning checks before publish: reference chain resolves, expiry after sent, polygon closed and valid, repeat of the same warning inside one hour flagged | `cap-aggregator` (ideas) | `src/cap/validation.py` | None; compare with existing checks first |
   | 7 | Compare our automatic-station CSV against their "AWS template" column list and units | `adl` | SURFACE configuration check, no code | Station make confirmed |

4. **Recommended for Barrels Grenada in general:**

   | # | Pattern | Taken from | First use |
   | --- | --- | --- | --- |
   | 8 | **On-site push agent.** A small program on a client's own computer pairs once with a one-time code, receives a device token, sends files or records outward over HTTPS, reports a heartbeat every five minutes, keeps working from its last configuration when offline, and stops when its token is revoked. No inbound port at the client. | `adl-agent`, `adl-agent-plugin` | Fingerprint clock-in terminals at the airport; the satellite receiver computer; station edge collectors (ADR-0032 decision 4). Tokens are organisation API keys (ADR-0029). |
   | 9 | **One-time setup codes.** An administrator clicks a button, gets a command that expires in 48 hours and works once; the installer asks one question and tests itself with a real upload. | `climweb-product-sync` | Onboarding item 8 and any future client integration |
   | 10 | **Alert on share of time down, not on each drop.** | `wis2watch` decision record 2 | Server and service alerts (`docs/infrastructure.md`) |
   | 11 | **Long jobs report progress and can be cancelled.** Progress is written to Redis so a screen can show it at once; the job checks for a cancel request at each step. | `django-task-ferry` (idea) | Register imports, payroll runs, bulk PDF generation in the ARQ worker |
   | 12 | **A data protection statement per product**: who is responsible for the data, a table of every data category with purpose and retention, and what is never collected. | `adl` `PRIVACY.md` | HR, Bookings and Events before they are sold outside the Authority |
   | 13 | **User-guide screenshots from a list.** A YAML file names each screen; a Playwright script captures them from a seeded instance, so guides are refreshed by one command. | `adl` `docs/screenshots` | `apps/web/docs`; extend `scripts/agents/ui-screenshots.mjs` |

5. **Considered and not recommended:**
   - ClimWeb and its add-ons (website, bulletin editor, city forecasts,
     product sync): replaced by our own apps.
   - GeoRiva and the Forti forecast server: explicitly not production-ready,
     and only relevant if the Met office runs its own weather model.
   - `tropycal-api`: a thin 2022 wrapper. Automatic storm-track fetching is
     not planned; if it is wanted later, use the underlying Tropycal library
     directly.
   - `aemet-dust-warnings`: West African countries only.
   - Automatic city forecasts from Open-Meteo or the Norwegian service (their
     `forecastmanager`): official forecasts for Grenada are written by Met
     office forecasters; noted for client sites outside Grenada only.
   - WIS2Watch as a running service: revisit after 78958 has published for a
     month; item 5 covers the immediate need.
   - Their station vendor connectors: none until the station make is known.

## Consequences

- One stack stays one stack; every item above lands in an existing domain
  with our own tests and permissions.
- Items 1 to 7 give the Met office the same publishing and checking behaviour
  that other WMO members already operate, which eases future WMO review.
- Items 8 and 9 give Barrels one reusable way to connect equipment that sits
  behind a client's firewall, instead of a new design per client.
- Porting costs time, and we do not get their future fixes for free. Each
  port names the upstream repository and commit in its module docstring so a
  later comparison is possible.
- Items 2, 4 and 6 touch Met office policy (event terms, thresholds, warning
  rules) and need Met office approval before they change behaviour.
- New Python dependencies still need owner approval; none is required by the
  items above.
