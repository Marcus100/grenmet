# eregister domain — agent context

**Owner:** GMS (manual meteorological observation register). Barrels maintains the code.

- Separate database with its own Alembic history (`alembic.ini`, `migrations/`); session from `database.py`.
- Routes `/api/v1/eregister/*` with a strict envelope: station IDs trimmed, observation times timezone-aware (UTC in outputs).
- Tests: `tests/test_eregister_persistence.py` (uses `dependency_overrides` for its own session and user).
- Related: ADR-0003, `docs/data-architecture.md`.

## SYNOP register rules

- `rules.py` holds the SYNOP workbook rules (pure functions; no I/O). Observers key coded FM-12 groups as on the paper register; the module validates them and decodes to SI for later BUFR/TAC/IWXXM encoders (`SynopDecoded`).
- Source: WMO-No. 306 Vol. I.2 regulation B/C1 (SYNOP in TDCF, template TM 307080). `temp-files/products/eregister/` is local and gitignored; copy rules into code and tests, never read it at runtime.
- Severity: `error` = impossible/malformed entry (blocks save in GAA Admin); `warning` = reporting-practice advice (B/C1.x), never changes `valid`.
- Entry formats: dd tens of degrees (00-36, 99 variable); ff in the unit given by `iw`; VV code 00-99; temperatures `TTT` or `snTTT` in tenths; pressures four digits in tenths of hPa with the thousands omitted; ww 00-99.
- A workbook with only identification fields is a NIL report (B/C general (ix)); advice about absent data is suppressed.
- Add a rule with a paper-register fixture in `tests/test_eregister_validation.py` (`PAPER_ROW` is the 30 March 2023 12 UTC row). Changing issue or decoded shapes changes the API: regenerate `openapi.json` and the client.
- METAR/SPECI/TAF coding rules live in `wxproducts/aviation_rules.py`, not here. IWXXM and BUFR are built at acceptance (see Encodings below); SURFACE remains the automated WIS2 path (see `docs/operations/eregister-wmo-conformance.md` for covered rules and gaps, and `docs/operations/wmo-weather-reference.md`).
- Section 3 extras (conformance doc lists sources and unconfirmed points): Tx/Tn report hours and air-temperature consistency, 58/59 24 h pressure change (keyed `j1`+`P24` with j1 8 rise or 9 fall; legacy 0/1 warn; TAC emits 58 or 59), 55SSS sunshine (`s3_sunshine_24h`), 3Ejjj (`s3_ground_state`, `s3_ground_jjj`), 9SpSpspsp groups in `s3_special_phenomena` (910ff confirmed by the register, 911ff also accepted), section 5 national text in `s5_national` (preserved, appended as `555 ...`, never validated). Hours and thresholds are named constants at the top of `rules.py`.
- `public.py` decodes the same coded workbook (TTT/snTTT tenths, 4-digit 24 h rainfall in tenths); keep its decoders in step with `rules.py`.
- Decoding follows B/C1: variable wind (dd 99) is direction 0 with a positive speed (B/C1.10.5.3.2); VV 89 (over 70 km) is 81 900 m (B/C1.4.2.2.2); VV 51 to 55 are unused and rejected. Wet bulb, gust, relative humidity and observer initials are optional entries. `derive.py` works out the dew point, vapour pressure and relative humidity from them, and the station, sea level, QFE and QNH pressures from the barometer reading and the station's fixed amounts (`observations.stations`: `total_correction_hpa`, `qfe_offset_hpa`, `sea_level_offset_hpa`, `qnh_offset_hpa`, read and set through `GET`/`PUT /stations/{station_id}/settings`). A keyed group 3 or 4 wins over the rule and a mismatch warns; 78958 holds the owner-confirmed 0.0, 0.3, 1.0 and 0.1 hPa, other stations start empty.


## Register states (`transitions.py`)

| State | Meaning | Accept / reject / reopen | Review | Correct | Sent | Public status |
| --- | --- | --- | --- | --- | --- | --- |
| `draft`, `qc_pending` | Awaiting acceptance (`PENDING_STATES`) | accept, reject | yes | yes | after acceptance | provisional |
| `accepted` | Decided | reopen | yes | yes | yes | accepted |
| `rejected` | Refused | reopen | no | no | never | not public |
| `superseded` | Replaced by a correction (restored if it is rejected) | none | no | no | never | not public |
| `historical` | Imported archive record (#1260) | none | yes | yes (restore returns here) | never (`NOT_SENDABLE_STATES`, regardless of `EREGISTER_SEND_REQUIRE_ACCEPTED`) | historical |

- `historical` is made only by `cl1_import` via `scripts/import_cl1_synop.py --historical` (`historical.save_hours`, same notes provenance and idempotency; only the importer's own unreviewed row is refreshed) or by `scripts/mark_imported_historical.py --month YYYY-MM [--apply]` (`historical.convert_month`: the importer's unreviewed, unsent drafts of the Grenada local month; dry run by default; audit action `mark_historical`). No API route sets it. Migration `eregister_0008` adds the enum value (PostgreSQL cannot drop one, so its downgrade is a no-op).
- `POST /observations/review-day` (`qc.review_day`, `eregister.qc`): marks every reviewable SYNOP of one Grenada local day that is not reviewed; skips the reviewer's own and already reviewed records; counts only. Problems do not exclude a record.
- `GET /observations` takes `observed_from` (inclusive) and `observed_to` (exclusive), UTC, filtered in SQL.
- Tests: `tests/test_eregister_historical.py`, `tests/test_eregister_transitions.py`.

## Send actions (email and WIS2)

- `POST /observations/{id}/email` and `/publish` (permission `eregister.send`) and `GET /observations/{id}/sends`. `sends.py` queues; `encode.py` is pure (FM 12 TAC from the keyed groups; the csv2bufr `Surface-RA-IV-100` CSV from the decoded SI values); `publisher.py` is the ARQ job body (`send_wis2_publications`, every 30 s).
- The send log `eregister_send` lives in the application database (observations are in the separate register DB, so no foreign key). Email rows go to the notifications `outbound_email` outbox in the same transaction; the history mirrors their delivery. The WIS2 row stores the CSV and is the durable job (queued, retry with backoff on the row, then sent or failed).
- Only validated SYNOP (no `error` issues on re-validation), not rejected or superseded; WIS2 publish always requires state `accepted`; email requires it too by default (`EREGISTER_SEND_REQUIRE_ACCEPTED`, default true). Set it false only if validated, unaccepted observations may be emailed, marked provisional. The BUFR check gates both sends (see Encodings). A repeat to the same target is 409 unless the body has `resend: true`.
- CSV unit rules (template `Surface-RA-IV-100`): visibility in km, cloud cover in oktas, CL/CM/CH as the plain 0-9 code (the template adds 30/20/10), DL/DM/DH 1-8 (template multiplies by 45), precipitation period as negative hours, stationType 1 (manned). `test_wis2_columns_match_the_vendored_template` pins the header to `scripts/wis2-setup/test-data`.
- Settings: `EREGISTER_OBS_RECIPIENTS`, `EREGISTER_SEND_REQUIRE_ACCEPTED` (default true), `WIS2BOX_*` (see `docs/env.md`). Tests: `tests/test_eregister_send.py`.

## Encodings (BUFR, IWXXM), built at acceptance

- `qc._store_encodings` builds both in the same register transaction as the acceptance and stores them on the row; nothing is sent there. An encoder failure is kept in the record's `errors` and never blocks acceptance.
- BUFR (`bufr.py`, template `Surface-RA-IV-100`, column `bufr`): the wis2box CSV (`encode.wis2_row`) is converted with `csv2bufr`, the message is decoded with ecCodes, and each element is compared with the observation's decoded SI values (not with the CSV). The record (`template`, `base64`, `checks`, `valid`, `errors`) is valid only when every element matches. `sends.load_sendable` refuses WIS2 and email while it is not valid (409).
- Reviewer override: `POST /observations/{id}/bufr-override` (requires `eregister.qc`; the observer of the observation, or of any observation it corrects, is refused; a reason of 10 to 500 characters). It lets a failed check send for that exact record only: the stored `record_sha256` must match the record's digest, so any re-encoding or correction ends it. It never changes the message or its validity.
- IWXXM 2025-2 METAR/SPECI (`iwxxm.py`, checked against the XSD bundle, column `iwxxm`) is built the same way. It is stored for the record and never gates sends.

## QC (accept, reject, reopen)

- `POST /observations/{id}/accept|reject|reopen` (permission `eregister.qc`, default role `eregister-qc`); `qc.py` holds the state machine: accept and reject from `draft`/`qc_pending`, reopen from `accepted`/`rejected` to `qc_pending`. `GET /observations?state=` feeds the QC queue (`draft` + `qc_pending`).
- The observer accepts their own observation (owner decision 2026-10-23); a review by another person is optional (`qc.review`, below) and never blocks sending. The entry form's "Save and approve" saves and accepts in one step. Reject and reopen need a reason (3+ characters); accept validates the workbook (422 on errors). Reopen is refused once a WIS2 send is queued or sent.
- A correction supersedes the original it replaces. Migration `eregister_0005` stores `superseded_from` (the original's state before) and `superseded_qc_notes` on the original. Rejecting a correction restores a still-superseded original to that state with its own `qc_notes`, so a never-accepted draft stays a draft (`qc._restore_original`). A row superseded before `eregister_0005` has NULL there: it returns as `accepted` when a held WIS2 file exists, otherwise it stays superseded. The publish gate returns to the original only when the restored state is `accepted`; any other restored state releases the correction's claim with `gate.release_hour`. The restore is audited with the real before and after of `qc_notes`.
- Review is optional and never changes the state: `qc.review` takes `seen_updated_at` (the version the reviewer opened) and answers 409 if the record was saved since, compared to the whole second the API returns.
- The row records `qc_by`, `qc_at`, `qc_notes` (register DB, migration `eregister_0002`). Each transition also writes an `audit` entry (`entity_type` `eregister_observation`, readable by `eregister.qc` or `eregister.send`) in the application DB, in a second commit: the two databases cannot share a transaction.
- Public endpoints already treat anything but `accepted` as provisional (`public.py`).
- Tests: `tests/test_eregister_send.py` (QC section).
- Cross-check: `tests/test_eregister_crosscheck.py` decodes the emitted TAC with `pymetdecoder` (dev dependency, test only; it cannot read NIL reports) and compares SI values with `rules.validate_synop`. `csv2bufr` and `eccodes` are runtime dependencies (see Encodings).

## Observation store and publish gate (ADR-0032)

- Schema `observations` in the register DB (migration `eregister_0003`, same eRegister Alembic chain, never the main chain): `stations` (registry and schedule `automatic`/`manual`/`hybrid` with `manual_hours_utc`), `observations` (natural key station, element, `valid_time_utc`, source; `store.upsert_observation` is idempotent, non-top-of-hour rows get `is_hourly` false), `publish_gate` (primary key station + UTC hour) and `publish_gate_decisions` (audit of every claim, reuse and refusal).
- `gate.claim_manual_hour` runs before `sends.queue_wis2` queues anything: unregistered station or an hour the schedule gives to `automatic` is 409 (`PublishGateError`); the insert on the primary key makes one claim win under concurrency; another observation for the same hour is 409. WIS2 is never queued twice (`resend` is ignored for WIS2); a failed send may be queued again by the same observation.
- 78958 was seeded `automatic` (SURFACE, ADR-0010); migration `eregister_0006` made it manual for all 24 hours (owner decision). That replaces SURFACE as the publisher of 78958 under this identifier; confirm with GMS that SURFACE has stopped or uses another identifier before a release publishes both. Other stations are not registered, so their sends are refused. Staff manage stations through the registry endpoints (see the Station registry section). Not built: ingest endpoint (needs ADR-0029 keys), element mapping table, SURFACE sync.

## Station registry (ADR-0032 amendment)

- `registry.py` lists, adds and edits `observations.stations` (routes `/stations`, `/stations/{id}`; reading = register access, changes = `eregister.qc`, no new permission key). Columns added by `eregister_0007`: `source_kind` (`manual`/`automatic`), `active`, and a partial unique index on `wigos_id`. `schedule` is derived from kind and `manual_hours_utc` (never sent by clients): automatic -> `automatic`, 24 hours -> `manual`, fewer -> `hybrid`.
- Audit entity `eregister_station` (`create`/`update`, only changed fields), second commit in the application DB. `gate.claim_manual_hour` refuses an inactive station.
- 78958 is the manual observer station (24 hours). The automatic weather station is a separate row added through this registry once GMS confirms its WIGOS id; never seed or guess one. `config.WIS2BOX_WIGOS_ID` and the CSV metadata are still 78958-only (per-station WIS2 metadata is not built).
- Tests: `tests/test_eregister_station_registry.py`.
- Rules: 78958 may only be renamed (source kind, hours, active and WIGOS id are refused with 422, `PROTECTED_MESSAGE`); a WIGOS id can be set once while empty and never changed or cleared (`WIGOS_FIXED_MESSAGE`; WIS2 file names and metadata still read `config.WIS2BOX_WIGOS_ID`); creating or switching to a manual station needs explicit non-empty hours; a check constraint keeps `source_kind` and `schedule` consistent. The missing-observation sweep (`notifications/gms_sweeps.py`) skips inactive stations.

## MetPy as the oracle (not a runtime dependency)

- MetPy 1.7.1 is a fast-back dev dependency only. The image does not need scipy, matplotlib or pint, so `derive.py` and `public.py` keep their own formulas. Do not import MetPy from `src/`.
- `tests/test_eregister_metpy_oracle.py` compares the register's dew point, vapour pressure, relative humidity, 9UUU dew point and knot factors with MetPy on realistic Grenada values, within the tolerances stated there.
- Deliberate differences: the psychrometer coefficient follows WMO-No. 8, `0.00066 (1 + 0.00115 Tw)`, not MetPy's default 6.21e-4 (up to 2 points of humidity apart); the saturation is Magnus (17.625, 243.04), not Bolton (MetPy). The station pressure amounts (QFE +0.3, sea level +1.0, QNH +0.1 for 78958) are owner constants; MetPy has no equivalent, and +1.0 hPa is about 8 to 9 m of height.
- The TypeScript mirrors (`gaa-admin` `eregister-derived.ts`, `gms` `feels-like.ts`) are checked against `apps/api/fastapi/scripts/metpy_fixtures.py`, which writes the committed `*.fixture.json` files. After changing MetPy or the grid, run `uv run --frozen --package fast-back python scripts/metpy_fixtures.py` from `apps/api/fastapi`; the oracle test fails while the fixtures are stale.

## Hourly sheet import (CL1)

- `cl1_import.py` (pure) turns GMS's monthly hourly sheet for 78958 (saved as CSV, 37 columns in paper-register order) into coded workbooks and checks each with `rules.validate_synop`, the hour-to-hour history and a dew point / humidity cross-check against `derive`. `scripts/import_cl1_synop.py` previews by default; `--apply` saves the passing hours as drafts through `entries.create` (so validation, derived groups and the one-live-row rule are the API's), oldest first, and refuses unless `ENVIRONMENT=local` and the register URL's host is this machine or the compose Postgres (the database name alone proves nothing: production is also `eregister`), and double-checks `current_database()`; `--allow-non-local` is the owner's go only. Tests: `tests/test_eregister_cl1_import.py` (made-up rows; the real sheets hold observations and stay in gitignored `temp-files/` or `/private/`).
- Sheet times are local standard time (UTC-4, `UTC_OFFSET_HOURS`); the register stores UTC. Confirmed on October 2026 by hand-keyed accepted entries that match the shifted hours exactly. Cloud layer heights in the sheet are metres / 10 and become the nearest hh code. Weather is coded only when ix is 1; otherwise the sheet's ww and W1W2 go to `notes`.
- The sheet has no rainfall, Tx/Tn, gust, pressure tendency or barometer reading, so those stay empty and the rules advise about them (and METAR shows `Q////`). Nothing is invented. An hour that fails a rule (for example four layers without cumulonimbus) is listed, never saved or changed. A row of zeros is an unobserved hour.
- Saved hours are `draft` and the importer cannot accept its own entries (four-eyes); another register staff member accepts. A re-run refreshes only a draft the importer itself made (its `notes` start with `cl1_import.IMPORT_NOTE_PREFIX`) that nobody reviewed (`may_update`); every other entry for that hour (observer-typed, reviewed, `qc_pending`, accepted) is left alone and listed. A rejected or superseded hour is not live, so a re-run would save a fresh draft over it. Duplicate rows for one hour and values the register would refuse block that hour instead of stopping the run.
- Observers' values (`daily_import.py`, `scripts/import_daily_values.py`): a small CSV, one row per main-hour observation in local time (`local_time`, `rainfall_24h_mm`, `highest_temp_c`, `lowest_temp_c`, `strongest_gust_kt`, `gust_time_local`), fills what the sheet lacks. Owner: the thermometers are read at every main hour (00, 06, 12, 18 UTC = 20, 02, 08, 14 local) and the daily rainfall at 08:00 local. Tx and Tn (`s3_max_temp`, `s3_min_temp`) go on the entry at that main hour; 24 h rainfall (`s3_rainfall_24h`, four digits in tenths of mm, 9999 trace) only on the 08:00 local (12 UTC) row, anything else is refused, never moved. A gust goes into `wind_gust` (unit of that entry's wind indicator, a ten-minute gust cell) on the first observation at or after its time, and is skipped when the entry already has a 910 group. It only adds values to an unreviewed hourly-importer draft (`may_update`), re-reads each hour right before saving, never replaces a different value, lists every hour it cannot change, and warns when an hourly dry bulb in the six hours before a reading falls outside its Tx/Tn or a gust is below the mean wind. The hourly importer's `carry_over` keeps these values when it refreshes a draft (the gust only if the wind unit is unchanged).
- The monthly statistics (`public.py`) read `s3_rainfall_24h` in its real four-digit form as well as the older three-digit form; before that, rainfall saved by the register's own rules was ignored in the totals.
