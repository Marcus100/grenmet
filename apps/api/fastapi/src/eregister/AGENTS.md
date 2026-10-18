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
- METAR/SPECI/TAF coding rules live in `wxproducts/aviation_rules.py`, not here. IWXXM/BUFR conversion and SURFACE/WIS2box transmission are not implemented (see `docs/operations/eregister-wmo-conformance.md` for covered rules and gaps, and `docs/operations/wmo-weather-reference.md`).
- `public.py` decodes the same coded workbook (TTT/snTTT tenths, 4-digit 24 h rainfall in tenths); keep its decoders in step with `rules.py`.
- Decoding follows B/C1: variable wind (dd 99) is direction 0 with a positive speed (B/C1.10.5.3.2); VV 89 (over 70 km) is 81 900 m (B/C1.4.2.2.2); VV 51 to 55 are unused and rejected. Wet bulb, gust, relative humidity and observer initials are optional entries; the dew point, vapour pressure and pressures are not calculated here yet.

