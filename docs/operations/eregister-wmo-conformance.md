# eRegister WMO conformance

**Status:** Active reference  
**Owner:** GMS (operational content); maintained by Barrels Grenada  
**Last updated:** 2026-10-18

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
| 5appp | a 0-8; a=4 needs ppp 000; a=1,2,3,6,7 need ppp above 000; one without the other: warning | Covered |
| 6RRRtR | RRR Code table 3590 (990 trace, 991-999 tenths), tR Code table 4019 | Covered |
| 7wwW1W2 | ww 00-99, W1/W2 0-9; W1 below W2: warning | Covered |
| 8NhCLCMCH | Nh not above N; N=0 or Nh=0 forces CL/CM (and CH when N=0) to 0; N=9 reports Nh 9 | Covered |
| 333 0CsDLDMDH | Code ranges | Covered |
| 1/2 snTxTn | Max not below min | Covered |
| 5 j1 P24 | Four digits; j1 other than 0/1: warning | Covered |
| 7R24 | Four digits, 9999 trace; missing at 12 UTC: warning | Covered |
| 8NsChshs | Up to 3 non-Cb layers plus Cb; Ns not above N; Ns 0 invalid; hshs Code table 1677 (51-55 unused, 81-89 in 1500 m steps); ascending order and completeness: warning | Covered |
| 9SpSpspsp, remarks | Free text, not validated | Not covered |
| NIL report | Identification only becomes a NIL report | Covered |

Not covered: regional (RA IV) hour tables for 1snTxTxTx/2snTnTnTn windows,
55SSS sunshine, 58/59 24 h tendency, 3Ejjj, section 5 national groups, and the
dd rounding rule for directions ending in 5 degrees (fff + 500). Decoded values
omit dew-point and pressure derivations (see `src/eregister/AGENTS.md`).

### Public current conditions (`eregister/public.py`)

The public page decodes the same workbook. Fixed: coded temperatures (`0254`,
`1034`) were rejected as non-degrees, so a correctly keyed reading showed no
temperature, and the 24 h rainfall (tenths of mm, four digits) was decoded with
the three-digit RRR table, overstating it tenfold or more. Plain degrees with a
decimal point are still accepted for older records.

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
| SPECI | Plausibility warning only: the message must show a criterion (visibility, ceiling, thunderstorm, freezing/heavy precipitation, strong wind). Proving a SPECI was warranted needs the previous report |

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

Month roll-over of day numbers is resolved from the entered issue/validity
times; when no time is entered and the days wrap, period-length checks are
skipped rather than guessed.

Not covered: Annex 3 App. 5 content rules that need the forecast meaning (for
example the change criteria for BECMG/TEMPO, half-period limits for TEMPO,
ceiling thresholds), maximum/minimum temperature windows against the validity,
aerodrome-specific minimum-sector altitude for CAVOK, and national remarks.

## Register preview (gaa-admin)

`eregister-metar.ts` renders an illustrative METAR from the SYNOP workbook.
Fixed: the time group read `3012:0Z`, a blank wind or pressure showed as calm
or `Q1000`, VV codes 90-96 printed `9999`, cloud used total oktas instead of
the layer amounts, bases ignored codes 56-89, CB was dropped, N=9 was not VV.
QNH is still taken from the MSL pressure group (an approximation).

## Not implemented (needs owner approval)

- **BUFR (template TM 307080 for SYNOP, and the METAR/SPECI BUFR templates):** no
  encoder exists. A pure-Python encoder is not practical; the practical route
  is `eccodes` (native library plus Python bindings) or the vendored SURFACE /
  wis2box stack. Adding a Python dependency needs approval.
- **IWXXM (METAR/SPECI/TAF XML):** see `aviation-converter-evaluation.md`
  (tac2iwxxm candidate, validators need Schematron assets). No dependency added.
- **TAC SYNOP encoder (AAXX line from the workbook):** the workbook is
  validated and decoded to SI, but no transmitted bulletin text is produced.
- **Annex 3 conformance of a whole SPECI decision** and **TAF forecast quality**.
