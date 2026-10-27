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
- METAR/SPECI/TAF coding rules live in `wxproducts/aviation_rules.py`, not here. IWXXM and BUFR encoding are not implemented here (wis2box converts the CSV); SURFACE remains the automated WIS2 path (see `docs/operations/eregister-wmo-conformance.md` for covered rules and gaps, and `docs/operations/wmo-weather-reference.md`).
- Section 3 extras (conformance doc lists sources and unconfirmed points): Tx/Tn report hours and air-temperature consistency, 58/59 24 h pressure change (keyed `j1`+`P24` with j1 8 rise or 9 fall; legacy 0/1 warn; TAC emits 58 or 59), 55SSS sunshine (`s3_sunshine_24h`), 3Ejjj (`s3_ground_state`, `s3_ground_jjj`), 9SpSpspsp groups in `s3_special_phenomena` (910ff confirmed by the register, 911ff also accepted), section 5 national text in `s5_national` (preserved, appended as `555 ...`, never validated). Hours and thresholds are named constants at the top of `rules.py`.
- `public.py` decodes the same coded workbook (TTT/snTTT tenths, 4-digit 24 h rainfall in tenths); keep its decoders in step with `rules.py`.
- Decoding follows B/C1: variable wind (dd 99) is direction 0 with a positive speed (B/C1.10.5.3.2); VV 89 (over 70 km) is 81 900 m (B/C1.4.2.2.2); VV 51 to 55 are unused and rejected. Wet bulb, gust, relative humidity and observer initials are optional entries; the dew point, vapour pressure and pressures are not calculated here yet.


## Send actions (email and WIS2)

- `POST /observations/{id}/email` and `/publish` (permission `eregister.send`) and `GET /observations/{id}/sends`. `sends.py` queues; `encode.py` is pure (FM 12 TAC from the keyed groups; the csv2bufr `Surface-RA-IV-100` CSV from the decoded SI values); `publisher.py` is the ARQ job body (`send_wis2_publications`, every 30 s).
- The send log `eregister_send` lives in the application database (observations are in the separate register DB, so no foreign key). Email rows go to the notifications `outbound_email` outbox in the same transaction; the history mirrors their delivery. The WIS2 row stores the CSV and is the durable job (queued, retry with backoff on the row, then sent or failed).
- Only validated SYNOP (no `error` issues on re-validation), not rejected or superseded; WIS2 publish always requires state `accepted`; email requires it only when `EREGISTER_SEND_REQUIRE_ACCEPTED` is true (default false: validated observations may be emailed for internal use, marked provisional). A repeat to the same target is 409 unless the body has `resend: true`.
- CSV unit rules (template `Surface-RA-IV-100`): visibility in km, cloud cover in oktas, CL/CM/CH as the plain 0-9 code (the template adds 30/20/10), DL/DM/DH 1-8 (template multiplies by 45), precipitation period as negative hours, stationType 1 (manned). `test_wis2_columns_match_the_vendored_template` pins the header to `scripts/wis2-setup/test-data`.
- Settings: `EREGISTER_OBS_RECIPIENTS`, `EREGISTER_SEND_REQUIRE_ACCEPTED`, `WIS2BOX_*` (see `docs/env.md`). Tests: `tests/test_eregister_send.py`.

## QC (accept, reject, reopen)

- `POST /observations/{id}/accept|reject|reopen` (permission `eregister.qc`, default role `eregister-qc`); `qc.py` holds the state machine: accept and reject from `draft`/`qc_pending`, reopen from `accepted`/`rejected` to `qc_pending`. `GET /observations?state=` feeds the QC queue (`draft` + `qc_pending`).
- Four-eyes: the observer (`actor_id`) can never accept their own observation, superusers included, even if no one else holds `eregister.qc`; it then waits. Reject and reopen need a reason (3+ characters); accept validates the workbook (422 on errors). Reopen is refused once a WIS2 send is queued or sent.
- The row records `qc_by`, `qc_at`, `qc_notes` (register DB, migration `eregister_0002`). Each transition also writes an `audit` entry (`entity_type` `eregister_observation`, readable by `eregister.qc` or `eregister.send`) in the application DB, in a second commit: the two databases cannot share a transaction.
- Public endpoints already treat anything but `accepted` as provisional (`public.py`).
- Tests: `tests/test_eregister_send.py` (QC section).
- Cross-check: `tests/test_eregister_crosscheck.py` decodes the emitted TAC with `pymetdecoder` (dev dependency, test only; it cannot read NIL reports) and compares SI values with `rules.validate_synop`. `csv2bufr` is also a dev dependency, reserved for checking the wis2box CSV against the vendored template.

## Observation store and publish gate (ADR-0032)

- Schema `observations` in the register DB (migration `eregister_0003`, same eRegister Alembic chain, never the main chain): `stations` (registry and schedule `automatic`/`manual`/`hybrid` with `manual_hours_utc`), `observations` (natural key station, element, `valid_time_utc`, source; `store.upsert_observation` is idempotent, non-top-of-hour rows get `is_hourly` false), `publish_gate` (primary key station + UTC hour) and `publish_gate_decisions` (audit of every claim, reuse and refusal).
- `gate.claim_manual_hour` runs before `sends.queue_wis2` queues anything: unregistered station or an hour the schedule gives to `automatic` is 409 (`PublishGateError`); the insert on the primary key makes one claim win under concurrency; another observation for the same hour is 409. WIS2 is never queued twice (`resend` is ignored for WIS2); a failed send may be queued again by the same observation.
- 78958 is seeded `automatic` (SURFACE publishes it, ADR-0010), so eRegister WIS2 is refused until the owner updates `observations.stations` for the agreed hours. There is no registry endpoint yet. Not built: ingest endpoint (needs ADR-0029 keys), element mapping table, SURFACE sync.

## Station registry (ADR-0032 amendment)

- `registry.py` lists, adds and edits `observations.stations` (routes `/stations`, `/stations/{id}`; reading = register access, changes = `eregister.qc`, no new permission key). Columns added by `eregister_0007`: `source_kind` (`manual`/`automatic`), `active`, and a partial unique index on `wigos_id`. `schedule` is derived from kind and `manual_hours_utc` (never sent by clients): automatic -> `automatic`, 24 hours -> `manual`, fewer -> `hybrid`.
- Audit entity `eregister_station` (`create`/`update`, only changed fields), second commit in the application DB. `gate.claim_manual_hour` refuses an inactive station.
- 78958 is the manual observer station (24 hours). The automatic weather station is a separate row added through this registry once GMS confirms its WIGOS id; never seed or guess one. `config.WIS2BOX_WIGOS_ID` and the CSV metadata are still 78958-only (per-station WIS2 metadata is not built).
- Tests: `tests/test_eregister_station_registry.py`.
