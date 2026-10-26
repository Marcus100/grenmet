# eRegister WMO conformance

**Status:** Active reference  
**Owner:** GMS (operational content); maintained by Barrels Grenada  
**Last updated:** 2026-10-25 (weather links, hour-to-hour warnings, METAR cross-check, 908 and 909 unconfirmed)

What the eRegister (SYNOP workbook) and the aviation composer (METAR, SPECI,
TAF) check against WMO-No. 306 (Manual on Codes, Vol. I.1 and I.2) and ICAO
Annex 3 / WMO-No. 49 Vol. II. Code: `apps/api/fastapi/src/eregister/rules.py`
(SYNOP), `apps/api/fastapi/src/wxproducts/aviation_rules.py` (METAR/SPECI/TAF).
Tests: `tests/test_eregister_validation.py`, `tests/test_eregister_public.py`,
`tests/wxproducts/test_aviation_rules.py`, and gaa-admin
`eregister-metar.test.ts`, `eregister-readings.test.ts`.

Severity: `error` is a code violation (SYNOP: blocks saving); `warning` is
reporting practice and never blocks. Aviation findings are always advisory:
a draft stays savable, nothing is transmitted.

## SYNOP (FM 12), `POST /api/v1/eregister/observations/validate-synop`

The observer keys the coded groups as on the paper register (top part is the
UI truth; the BUFR PDF template TM 307080 drives the validation and the decode
to SI).

| Group | Rule | Status |
| --- | --- | --- |
| MiMiMjMj | AAXX, BBXX or OOXX | Covered |
| YYGG | Day 01-31, hour 00-23; warning off the standard hours 00/03/.../21 | Covered |
| iw | 0, 1, 3, 4 (2 invalid); unit drives the m/s decode | Covered |
| IIiii | Five digits | Covered |
| iR (Code table 1819) | 0/1/2 group 6 included (warning if missing); 3/4 omitted (error if 6RRRtR keyed) | Covered |
| ix (Code table 1860) | 1/4/7 group 7 included (warning if missing); 2/3/5/6 omitted (error if ww/W1W2 keyed) | Covered |
| h, VV | Code 0-9; VV Code table 4377 (51-55 unused, 89 = 81 900 m, 90-99 classes) | Covered |
| ww (4677) 41-49 | Fog at the station with visibility 1000 m or more: warning | Covered |
| Nddff | dd tens of degrees 00-36, 99 variable; 00/00 together only for calm; ff two digits, or three digits (00fff) from 099; ff=99 without fff: warning | Covered |
| Gust | Same ff/fff rule; gust below mean: warning | Covered |
| 1snTTT, 2snTdTdTd | Sign 0/1, tenths; dew point above air is an error; "1000" (negative zero): warning | Covered |
| 3P0P0P0P0, 4PPPP | Four digits, thousands omitted; MSL 870-1085.7 hPa, station 500-1085.7 hPa; station pressure with MSL: warning | Covered |
| Pressures from the barometer (78958) | Station rule, owner confirmed 2026-10-24: station = barometer as read + 0.0; QFE = station + 0.3; MSL = station + 1.0 (the Excel register, group 3 0157 gives group 4 0167); QNH = MSL + 0.1. Blank groups 3 and 4 are filled from the rule; a keyed group that differs warns (`station_pressure_mismatch`, `sea_level_mismatch`); amounts are station settings (`derive.py`, `stations.py`) | Covered. A fixed station amount, not a WMO reduction formula; other stations need their own amounts |
| 5appp | a 0-8; a=4 needs ppp 000; a=1,2,3,6,7 need ppp above 000; one without the other: warning | Covered |
| 6RRRtR | RRR Code table 3590 (990 trace, 991-999 tenths), tR Code table 4019 | Covered |
| 7wwW1W2 | ww 00-99, W1/W2 0-9; W1 below W2: warning | Covered |
| 8NhCLCMCH | Nh not above N; N=0 or Nh=0 forces CL/CM (and CH when N=0) to 0; N=9 reports Nh 9 | Covered |
| 333 0CsDLDMDH | Code ranges | Covered |
| 1snTxTxTx, 2snTnTnTn | Max not below min; air temperature at the report time outside [Tn, Tx]: warning; expected every 6 hours, 00/06/12/18 UTC (`TXTN_REPORT_HOURS`): warning when missing at those hours and when keyed at others | Covered as advice. Owner decision 2026-10-23 (every 6 hours) |
| 58P24P24P24, 59P24P24P24 | Keyed as j1 (8 rise or zero, 9 fall) + P24P24P24 in tenths; the TAC emits `58` or `59`; j1 other than 8/9 is an error (legacy 0/1 are read as 8/9 with a `legacy_sign` warning); 9 with 000 and changes above 40 hPa: warning; decoded to Pa with sign | Covered. Confirmed by the paper register and WMO-No. 306 (see below) |
| 55SSS | Field `s3_sunshine_24h`: three digits, hours and tenths, at most 240 (24.0 h) is an error; the station does not report it (owner decision 2026-10-23): a keyed value warns (`sunshine_not_reported`) and is still decoded to hours | Accepted for compatibility only |
| 3Ejjj | Fields `s3_ground_state` (E, Code table 0901, 0-9) and `s3_ground_jjj` (three digits, regional use): jjj without E warns; E 4 (frozen) or 5 (glaze) with air above 5 C warns; E goes to the CSV `ground_state` | Covered. jjj content (for example snTgTg) is passed through, not decoded |
| 9SpSpspsp | Field `s3_special_phenomena`, space separated: each group is five digits starting with 9 (error otherwise); 910ff and 911ff gusts (both accepted), 960ww accepted; gust below mean, duplicate group and a gust also keyed in the gust field warn; other 9SpSp groups pass through with a warning | Covered for the common groups |
| 555 national | Field `s5_national`: preserved as keyed and appended after section 3 as `555 ...`; never validated | Covered (passthrough) |
| 7R24 | Four digits, 9999 trace; missing at 12 UTC: warning; keyed at another hour: warning | Covered |
| 5appp (every 3 hours) | Missing at 00, 03, ... 21 UTC: warning (`missing_pressure_change`) | Covered as advice (owner decision 2026-10-23) |
| 6RRRtR (every main hour) | Omitted (iR 3 or 4) or missing at 00, 06, 12, 18 UTC: warning | Covered as advice (owner decision 2026-10-23). "Main hour" is read as 00, 06, 12, 18 UTC |
| 909Rtdc | Precipitation timing and duration: Region IV supplementary group 9SpSpspsp with SpSp 09, giving the time of beginning or end of the precipitation (Rt) and its duration (dc), reported with 6RRRtR. Field `s3_group_909`: five digits starting 909, passed into section 3 | Format only. Rt and dc are not decoded or carried in the WIS2 file: the local WMO-No. 306 Vol. I.2 has BUFR Code table 0 13 057 (time of beginning or end of precipitation, a Region I practice) but not the traditional code tables for Rt and dc, and the Region IV template TM 307084 has no precipitation timing element. Rt (Code table 3552) and dc (Code table 0833) are validated as format and range only. They could not be confirmed against Vol. I.1 (not on file); confirm them from Vol. I.1 or Vol. II (Region IV) before decoding |
| 8NsChshs | Up to 3 non-Cb layers plus Cb; Ns not above N; Ns 0 invalid; hshs Code table 1677 (51-55 unused, 81-89 in 1500 m steps); ascending order and completeness: warning | Covered |
| Remarks (`s3_remarks`, `notes`) | Free text, not validated and not encoded | Not covered |
| NIL report | Identification only becomes a NIL report | Covered |
| ww, N, W1W2, 6RRRtR links (12.2.6.4, 12.2.6.6) | Precipitation or thunderstorm ww with N=0, a thunderstorm without a cumulonimbus (CL 3 or 9, or a layer of type 9), and rain in 6RRRtR with no precipitation in ww or W1W2 within the past-weather period: warnings. W2 empty while W1 is keyed: warning | Covered as advice (`precipitation_without_cloud`, `thunderstorm_without_cb`, `rain_without_weather`, `past_weather_second_missing`) |
| Cloud links (12.4.10) | A second reported layer needs at least 3 oktas and a third at least 5, a Cb in CL must appear as a layer of type 9, N not observed (`/`) means no 8-group, N=9 needs the 89/hshs group: warnings | Covered as advice (`layer_amount_too_small`, `cumulonimbus_not_reported`, `cloud_not_observed`, `obscured_needs_group`) |
| Humidity, 2 9UUU (Code table 3845 sign 9) | Group 2 may carry relative humidity (0-100) instead of the dew point. The dew point is calculated from the humidity and the air temperature (Magnus), so the report validates, decodes and feeds the METAR check | Covered. The public current-conditions page does not decode this form yet |
| 9SpSpspsp (Code table 3778) | Time groups 900, 901, 905 point at the ww in 7wwW1W2; 902, 904, 906, 907 at the 9-group that follows; 903 at the one that precedes (`time_group_without_weather`, `time_group_without_target`, warnings); 910-914 wind speed groups with 00fff from 99, 913/915 repeat for a wind change, others do not repeat; 915 direction 00-36 or 99; highest mean wind below the lowest (`mean_wind_order`, warning) | Covered as advice. Code table 3778 is read from the local Vol. I.2 extract |
| 908 | Reported as not used (`unused_supplementary`) | **Unconfirmed, warning only.** Vol. I.1 is not on file, so "908 is not used" could not be confirmed; it is a warning until the table is checked |

Save-time checks (`POST /observations`, `.../correct`, accept): a SYNOP with
errors is refused with `422`; the keyed day (YY) and hour (GG) must equal the
UTC day and hour of `observed_at` (`time_mismatch`, an error). Warnings never
block saving.

Not covered: the dd rounding rule for directions ending in 5 degrees
(fff + 500), 4E'sss (ground with snow), 5EEEiE evaporation and the other
sunshine/radiation groups after 55SSS. Decoded values omit dew-point and
pressure derivations (see `src/eregister/AGENTS.md`).

**Unconfirmed against the manuals (owner to confirm with GMS and the
observers).** Written from WMO-No. 306 Vol. I.1 FM 12 section 3 as understood
on 2026-10-18; the local copy holds only Vol. I.2, so none of these were checked
line by line:

- *Tx/Tn period (RA IV).* The owner confirmed that Tx and Tn are reported
  every 6 hours (00, 06, 12, 18 UTC). The period each covers is not confirmed.
  Warnings only; hours are named constants in `rules.py`.
- *Humidity.* Dew point, vapour pressure and relative humidity are calculated
  from the dry and wet bulb with the psychrometer equation (`derive.py`). The
  GMS psychrometric table, and how it treats a wet bulb below 0 degrees, are not
  confirmed.
- *Stored body is the record.* The calculated fields are written into the body
  when it is saved (validate, create, correct) and are not recomputed when an
  observation is read, accepted or sent: an accepted keyed dew point stays in the
  TAC and the WIS2 CSV even if the formulas change later.
- *Entry formats.* Barometer as read: 3 or 4 digits with at most one decimal
  (`1013.2`). Visibility: kilometres as plain digits with an optional decimal part;
  signs, exponents and other digits are refused.
- *9SpSpspsp order.* Section 3 sends the gust (`910ff`, with `00fff` for 99 and
  over) and `s3_group_909` built from their own fields first, then the groups typed
  in `s3_special_phenomena` in the order the observer keyed them. Typed groups are
  never sorted, so a time group (902 to 907) stays next to the group it qualifies
  (`90403 93205 90710 91130` is sent unchanged). A typed group with the same
  9SpSp prefix as a field-built one (a typed 910 with the gust field set, a typed
  909 with `s3_group_909` set), and the `00fff` group after it, is not sent; the
  dedicated field wins and validation warns (`duplicate_special_group`). Whether
  FM 12 requires the 9-groups in ascending order could not be confirmed against
  the Manual on Codes, so no order is imposed.
- *Gust group.* The workbook gust field is encoded as `910ff` (past 10 minutes).
  Whether observers mean `910ff` or `911ff` (highest gust since the previous
  main observation) was unconfirmed. The paper register settles it: see
  "Confirmed by the paper register" below. Both stay accepted in
  `s3_special_phenomena`.
- *3Ejjj.* jjj is regional use; only its shape is checked.

**Confirmed by the paper register (GMS photographs, columns 43-44, 45-46, 33-38,
47-62 and 63) and WMO-No. 306 Vol. I.1.**

- *58/59.* Columns 43-44 are headed `5j1` + `P24P24P24`. The `5` is printed;
  the observer keys j1 as 8 or 9. WMO-No. 306 FM 12 defines `58p24p24p24`
  (positive or zero 24 h change) and `59p24p24p24` (negative change). Real
  entries: `58 004` (+0.4 hPa), `59 011` (-1.1 hPa), `59 010` (-1.0 hPa). The
  stored value is j1 + P24 (`8004`, `9011`); the TAC emits `58004` / `59011`.
  An earlier reading of j1 as 0/1 was wrong; rows saved with 0/1 still encode
  (0 as 58, 1 as 59) but warn to rekey as 8/9. The 1Sn / 2Sn temperature
  groups are different: their sign digit really is 0 or 1.
- *Gust.* The register records the gust only as the METAR-style `fmfm` above
  `ff` in Section 1, column 11 (the 10-minute gust). Section 3 has no 910/911
  column (column 63 is `9SpSpspsp` special phenomena). So the SYNOP gust goes
  out as `910ff`: 910ff is confirmed by the register. 911ff stays accepted
  when keyed in special phenomena.
- *Groups the register does not carry.* There are no 55SSS (sunshine) and no
  3Ejjj (ground state) columns, so those optional groups are unused by GMS
  today; the API still accepts `s3_sunshine_24h`, `s3_ground_state` and
  `s3_ground_jjj`.
- *Groups the register does carry.* `333 0CsDLDMDH` (columns 33-38), `1snTxTxTx`
  / `2snTnTnTn` at 12 UTC (39-42), `7R24R24R24R24` (45-46, for example `7 9999`
  for a trace), four `8NsChshs` layers (47-62) and 9-groups for special
  phenomena (63).
- *Layout coverage.* `eregister-layout.ts` has a column for each of the groups
  above (including the 5j1 sign cell hinted as `58`). Missing from the layout:
  `s3_sunshine_24h`, `s3_ground_state`, `s3_ground_jjj` and `s5_national`, none
  of which the register prints.

The paper-register layout (`eregister-layout.ts`) does not have columns for the
new fields yet (`s3_sunshine_24h`, `s3_ground_state`, `s3_ground_jjj`,
`s5_national`); the API accepts them and the workbook UI passes unknown keys
through unchanged.

### Acceptance, review and corrections (owner decisions, 23 Oct 2026)

- The observer accepts their own observation alone; WIS2 and email go out at
  that acceptance, on time every hour. Another register staff member may record
  an optional review (`reviewed` or `query` with a note); it never holds the
  report back. The publish gate rules (ADR-0032) are unchanged.
- A mistake after sending is corrected, not edited: `POST /observations/{id}/correct`
  saves a new observation that supersedes the old one. The old row stays visible,
  struck through, as on the paper register (strike through and re-enter).
- When the superseded observation was already queued or sent to WIS2, accepting
  the correction queues the corrected file: the publish gate hands the station
  hour over to the correction, the send row is flagged `correction` and the
  email is marked `CORRECTION` with a `CCA` line (the TAC correction indicator
  of the bulletin header).
- **Gap (open).** The csv2bufr template `Surface-RA-IV-100` has no correction
  or update-sequence column, so the CSV itself cannot carry the flag and the
  corrected file reuses the original file name. TODO: confirm with GMS and
  wis2box how a corrected BUFR must be marked (BUFR section 1 update sequence
  number, or a `CCA` bulletin header) and whether wis2box overwrites or
  republishes a file with the same name; until then the correction is flagged
  only in the send log and the email.
- One live observation exists per station, time and kind; re-keying the same
  hour updates the observer's own unsent draft instead of adding a row.
- Open point for GMS: WMO-No. 306 rounds a wind direction ending in 5 degrees to
  the next ten degrees; the workbook keys dd in tens of degrees, so such an
  entry cannot be typed and no rule was added. The `fff + 500` rule above is
  still not covered.

### Public current conditions (`eregister/public.py`)

The public page decodes the same workbook. Fixed: coded temperatures (`0254`,
`1034`) were rejected as non-degrees, so a correctly keyed reading showed no
temperature, and the 24 h rainfall (tenths of mm, four digits) was decoded with
the three-digit RRR table, overstating it tenfold or more. Plain degrees with a
decimal point are still accepted for older records.

## Hour-to-hour warnings, `src/eregister/hourly.py`

Every hour of station 78958 is keyed by hand, so the saved SYNOP of the previous hour (and of 3 hours earlier) is compared with the one being checked. The server reads them when the request carries `observed_at`, from observations that are not rejected or superseded. All are warnings and never block saving. The limits are one object (`HourlyLimits`); `DEFAULT_LIMITS` applies to every station until they are stored per station. They are standard quality-control step tests (WMO Guide to Instruments and Methods of Observation), not WMO code rules, and the values are defaults to tune with GMS.

| Check (code) | Default limit |
| --- | --- |
| Air temperature step (`temperature_jump`) | 5.0 C against the previous hour |
| Dew point step (`dew_point_jump`) | 5.0 C against the previous hour |
| Wind speed step (`wind_speed_jump`) | 8 m/s against the previous hour |
| Wind direction step (`wind_direction_jump`) | 90 degrees, only when both hours have at least 5 m/s and neither hour is variable (dd 99) |
| Visibility drop (`visibility_drop`) | From 10 km or more to under 1 km with no ww that explains it (haze, mist, fog, precipitation, thunderstorm) |
| Pressure change against 5appp (`tendency_vs_pressure`) | Station pressure change over 3 h differs from the keyed a and ppp by more than 0.5 hPa |

## METAR cross-check, `src/eregister/metar.py`

The register builds the METAR the observation implies (`expected_metar` in the validate response, shown on the register screen) and compares a METAR typed in `metar_text` with it. Every disagreement is a warning on the field `metar_text` (`metar_wind`, `metar_gust`, `metar_visibility`, `metar_cloud_missing`, `metar_cloud_extra`, `metar_cavok`, `metar_temperature`, `metar_dew_point`, `metar_qnh`). A NIL report is not compared. Rounding follows ICAO Annex 3 Appendix 3 as carried in WMO-No. 49 Vol. II (2018, updated 2021, the edition on file); Amendment 82 (applicable from 27 November 2025) is not on file and the steps need re-checking against it.

| Element | Rule used |
| --- | --- |
| Wind | Direction to 10 degrees, speed to 1 kt (m/s converted, one knot either way accepted); gust only at 10 kt or more over the mean (also for VRB); under 1 kt is calm |
| Visibility | 50 m steps under 800 m, 100 m to 5 km, 1 km to 10 km, 9999 from 10 km, rounded down; any value inside the SYNOP VV range is accepted |
| Cloud | FEW 1-2, SCT 3-4, BKN 5-7, OVC 8 oktas; base from hshs (Code table 1677) in 100 ft steps to 10 000 ft and 1000 ft steps above, rounded down; non-Cb layers above 1500 m may be typed but are not required; Cb at any height; obscured sky needs VV (VV/// when the height is unusable); N above 0 with no layer keyed is not compared and is never read as clear; trend and remark groups (TEMPO, BECMG, NOSIG, RMK onward) are not part of the main body |
| Temperature, dew point | Whole degrees, 0.5 rounds up; observed below zero but rounded to zero is written M00 (00 also accepted). The dew point is the decoded value, so a 2 9UUU humidity group gives the calculated dew point |
| QNH | Whole hPa, rounded down |

The token parser here duplicates some of `wxproducts/aviation_rules.py` (wind, visibility, cloud and temperature groups); it is kept separate because it compares values with the observation rather than checking coding grammar, and the two should be merged later. The aerodrome identifier is fixed to TGPY.

## METAR / SPECI (FM 15/16), `POST /api/v1/wxproducts/aviation/drafts/validate`

Group order is enforced: location, YYGGggZ, AUTO/NIL, wind, variation,
visibility, minimum visibility, RVR, weather, cloud, T'T'/T'dT'd, Q, RE, WS,
trend, RMK.

| Element | Rules checked |
| --- | --- |
| Header | METAR/SPECI matches draft kind; ICAO location matches draft station; YYGGggZ valid and equal to the entered observation time; routine METAR at H+00/H+30 (warning); NIL ends the message; COR |
| Wind | dddff[Gfmfm]KT/MPS; direction rounded to 10 degrees; 000 only with 00 (calm); north is 360; VRB for speeds below 3 kt (warning above); gust only when 10 kt (5 m/s) over mean |
| Variation | dndndnVdxdxdx only with mean 3 kt or more, not with VRB, 60 to less than 180 degrees clockwise |
| Visibility | 50 m steps below 800 m, 100 m to 5 km, 1000 m to 9 km, 9999; minimum visibility needs a compass direction, is below prevailing and meets the 1500 m / 50 % criteria (warning) |
| RVR | Runway 01-36 [LCR]; 25/50/100 m steps; M0050 / P2000; trend U/D/N; missing RVR below 1500 m (warning) |
| Weather | Intensity/VC/descriptor/phenomenon grammar and combinations (MI/BC/PR with FG, SH and TS with precipitation, FZ with DZ/RA/FG, VC list); FG below 1000 m, BR 1000-5000 m, HZ/FU/DU/SA/VA at 5000 m or less; more than three groups (warning); TS without CB/TCU (warning) |
| Cloud | FEW/SCT/BKN/OVC with CB/TCU, VV, NSC, NCD, SKC; first layer any amount, second SCT or more, third BKN or more, CB/TCU additional; ascending bases; 100 ft then 1000 ft rounding; at most three layers plus one CB/TCU |
| CAVOK | Conflicts with visibility/weather/cloud groups; reported when all conditions are met (warning) |
| Temperature, Q | M for negatives, dew point not above air; Q 850-1090 hPa (warning); A accepted |
| Recent weather, windshear | RE list, WS RWYnn / ALL RWY accepted |
| Trend | NOSIG, or BECMG/TEMPO with FM/TL/AT (hhmm, in that order) within two hours; elements limited to wind, visibility, weather/NSW, cloud/NSC/CAVOK; NOSIG not combined with change groups |
| SPECI | Without `previous_message`: plausibility warning only (the message must show a criterion). With `previous_message` (the preceding METAR/SPECI): Annex 3 App. 3 2.3 comparison, `speci_no_change` warning when none is met: wind direction change of 60 degrees or more with mean 10 kt or more, mean speed change of 10 kt, gust excess up 10 kt with mean 15 kt, visibility through 800/1500/3000/5000 m, lowest BKN/OVC base or vertical visibility through 300/600/1500/3000 ft, cloud below 1500 ft between SCT-or-less and BKN/OVC, onset or end of freezing precipitation, moderate or heavy precipitation, thunderstorm, duststorm or sandstorm, funnel cloud, squall, air temperature up 2 degrees C. `speci_previous_unreadable` when the previous text has no wind, visibility or cloud. Local criteria (runway wind limits, RVR, snow depth) are not checked |

## TAF (FM 51)

| Element | Rules checked |
| --- | --- |
| Header | TAF [AMD/COR] CCCC YYGGggZ; location matches; issue time equals the entered issue time; NIL |
| Validity | YYG1G1/YYG2G2, hours 00-24, length 6 to 30 h, equals the entered validity; issued after validity start (warning) |
| CNL | `TAF AMD ... CNL` ends the message |
| Base forecast | Wind, visibility (or CAVOK) and cloud (or NSC/VV/CAVOK) required; no RVR, Q, temperature or wind variation groups |
| TX/TN | Format, one of each, TX not below TN, TX before TN (warning) |
| BECMG, TEMPO | YYG1G1/YYG2G2 inside the validity, ends after it starts, at most 4 h; at least one change element; NSW allowed |
| PROB30/40 | With TEMPO or alone with a period; not combined with BECMG |
| FMYYGGgg | Inside the validity, ascending, complete (wind, visibility, cloud) |
| Change criteria (App. 5 1.3) | Advisory `taf_change_criteria` warning when a BECMG, FM, TEMPO or PROB group meets none of: wind change (60 degrees at 10 kt, 10 kt speed, gust excess 10 kt at 15 kt), visibility through 150/350/600/800/1500/3000/5000 m, onset or end of freezing/moderate or heavy precipitation, thunderstorm, duststorm/sandstorm, funnel cloud, squall, lowest BKN/OVC base through 100/200/500/1000/1500 ft or cloud below 1500 ft changing amount class. The reference is the base forecast, updated by each BECMG and FM; TEMPO and PROB do not move it |

Month roll-over of day numbers is resolved from the entered issue/validity
times; when no time is entered and the days wrap, period-length checks are
skipped rather than guessed.

Not covered: half-period limits for TEMPO, maximum/minimum temperature windows
against the validity, aerodrome-specific criteria (wind through runway limits,
minimum-sector altitude for CAVOK), and national remarks. The change criteria
and SPECI comparison live in `wxproducts/aviation_changes.py`; the thresholds
are Annex 3 values written from memory of the 2020s editions, so confirm them
against the edition GMS works to.

## Register preview (gaa-admin)

`eregister-metar.ts` renders an illustrative METAR from the SYNOP workbook.
Fixed: the time group read `3012:0Z`, a blank wind or pressure showed as calm
or `Q1000`, VV codes 90-96 printed `9999`, cloud used total oktas instead of
the layer amounts, bases ignored codes 56-89, CB was dropped, N=9 was not VV.
QNH is still taken from the MSL pressure group (an approximation).

## QC accept step, `src/eregister/qc.py`

Owner decision (Barrels foundations plan): a duty or senior forecaster accepts
each observation. `POST /api/v1/eregister/observations/{id}/accept`, `/reject`
and `/reopen`, permission `eregister.qc` (role `eregister-qc`). The observer
who saved an observation can never accept it, superusers included; with no
other QC holder the observation waits rather than being waved through. Reject
and reopen need a reason; accept needs a workbook that validates; reopen is
refused once the observation is queued for WIS2. Every decision is audited
(`eregister_observation`). WIS2 publication always requires `accepted`; email
is allowed for validated observations (internal use, marked provisional) unless
`EREGISTER_SEND_REQUIRE_ACCEPTED` is set. The public page and month summary
call a reading provisional unless it is accepted.

## Send actions (email and WIS2), `src/eregister/encode.py`

"Email observation" acts on a saved SYNOP that re-validates without errors
(rejected and superseded are refused); "Send last obs" (WIS2) additionally needs
QC acceptance, so it answers 409 for a fresh draft. The sends are logged in
`eregister_send`; see `src/eregister/AGENTS.md` and `docs/env.md`.

**TAC (FM 12).** The workbook already holds the coded groups, so the message is
those groups in section order: `AAXX YYGGiw IIiii iRixhVV Nddff [00fff] 1snTTT
2snTdTdTd | 29UUU 3P0P0P0P0 4PPPP 5appp 6RRRtR 7wwW1W2 8NhCLCMCH`, then `333`
with `0CsDLDMDH 1snTxTxTx 2snTnTnTn 5j1P24 7R24 8NsChshs 910ff [00fff]`, ending
`=`. Absent groups are omitted, missing elements inside a kept group are `/`,
an identification-only report is `AAXX YYGGiw IIiii NIL=`. Assumptions to
confirm with the observers: remarks are not encoded (the email shows the notes). Supplementary 9-groups and section 5 (`555 ...`) are appended as keyed.

**wis2box CSV.** wis2box runs csv2bufr with the vendored template
`Surface-RA-IV-100` (`scripts/wis2-setup/`), the same columns SURFACE publishes
(ADR-0010), so the existing dataset needs no change. One row per observation,
file `wmo_data_<WIGOS>_<YYYYMMDDTHHMM>.csv`, object key
`<WIS2BOX_TOPIC_HIERARCHY>/<file>` in `wis2box-incoming`. Mapping from the
decoded SI values: temperatures K, pressures Pa, wind m/s (the `iw` unit is
converted), precipitation mm (trace -0.1) with its period as negative hours,
visibility in km (the template multiplies by 1000), cloud cover and Nh in
oktas, CL/CM/CH plain codes (template adds 30/20/10), DL/DM/DH 1-8, layers as
Ns / C / height in metres, lowest cloud base the lower bound of the h class,
24 h pressure change in Pa with sign, station type 1 (manned). Not collected,
so empty: soil, radiation, snow, wind gust direction. The ground state E fills `ground_state`.

## Not implemented (needs owner approval)

- **BUFR in the API (template TM 307080 for SYNOP, and the METAR/SPECI BUFR
  templates):** no encoder exists. wis2box converts instead: "Send last obs"
  hands it a CSV (see Send actions). METAR/SPECI have no WIS2 path yet.
- **IWXXM (METAR/SPECI/TAF XML):** see `aviation-converter-evaluation.md`
  (tac2iwxxm candidate, validators need Schematron assets). No dependency added.
- **Annex 3 conformance of a whole SPECI decision** and **TAF forecast quality**.
