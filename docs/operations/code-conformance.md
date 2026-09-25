# GMS report and BUFR conformance checks

**Status:** implementation checklist; no report type is certified by this page.

The applicable references are the WMO Technical Regulations (WMO-No. 49), the
Manual on Codes (WMO-No. 306), and, for aviation, ICAO Annex 3 and PANS-MET.
Record the edition, clause, operational interpretation, test case and GMS
approval for each rule before it becomes an issuance gate.

| Product or representation | Primary reference | Current repo evidence | Required gate before operational issuance |
| --- | --- | --- | --- |
| SYNOP TAC | [WMO-No. 306 Volume I.1 (2019)](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/wmo-information-system-wis/about-manual-codes-volume-i1); [WMO-No. 49 Volume I](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/aviation/aviation-resources-technical-regulations-guidance-and-other-reference-materials) | eRegister checks a few workbook ranges; no complete TAC encoder/decoder or issue gate | Validate mandatory and conditional groups, code tables, report time, station identity, missing data, corrections, and sample reports against exact manual clauses. |
| Surface observation BUFR | [WMO-No. 306 Volume I.2 (2025 and approved amendments)](https://community.wmo.int/site/knowledge-hub/programmes-and-initiatives/wmo-information-system-wis/about-manual-codes-volume-i2) | SURFACE → wis2box csv2bufr template; `check_bufr.py` independently checks selected decoded fields | Decode generated output; verify every required descriptor, units, missing values, metadata, time and receiving-system acceptance. Review the pinned BUFR master table version against the applicable edition. |
| METAR and SPECI TAC | [ICAO Annex 3 and PANS-MET](https://community.wmo.int/media/news/aviation-news-2025-09-05-icao-publishes-new-editions-of-annex-3-and-pans-met); WMO-No. 306 Volume I.1; [WMO-No. 782 (2025 guidance)](https://wmo.int/media/news/aviation-news-2025-08-28-wmo-publishes-update-wmo-no-782-aerodrome-reports-and-forecasts-users) | Aviation drafts check station shape and times, but do not validate the full coded report | Validate report syntax and conditional groups, observation time, local reporting procedures, corrections and receiver profile; test with real GMS examples. |
| TAF TAC | Same aviation references | TAF drafts exist in wxproducts; eRegister has no TAF product lifecycle | Validate issue/validity periods, change groups, amendments/cancellations, syntax and receiver profile against GMS examples. |
| Aviation IWXXM | [WMO IWXXM](https://wmo.int/iwxxm); ICAO Annex 3 and PANS-MET | The workspace [evaluated the supplied EMPIRIC2 TAC-to-IWXXM converter](aviation-converter-evaluation.md), including separate TAC and XML validators. It is not installed or wired into eRegister; eRegister only stores an opaque IWXXM field. | Verify the pinned converter on Python 3.14 with GMS reports, choose the receiver's IWXXM version, run XSD and Schematron without required stages skipped, and compare XML meaning with the issued TAC revision. |

For each issued report, retain the original observation or forecast inputs, the
exact TAC and binary/XML bytes, validation result and rule-set version, issuing
person, correction chain, recipient and transmission evidence. A decoded BUFR
transfer check verifies selected fields; it does not validate the observation's
meteorological quality or replace operational review.

The current SURFACE mapping pins `masterTablesVersionNumber` to **30**. Do not
change that value simply because a newer WMO edition exists: confirm the
template descriptors, ecCodes tables and recipient compatibility together.

Use the supplied converter as the first implementation candidate for aviation
IWXXM. Its source review and remaining dependency/runtime questions are in
[`aviation-converter-evaluation.md`](aviation-converter-evaluation.md). The
source link is present in this workspace; a converter checkout is not present
in the tracked monorepo.

**Next evidence needed:** representative GMS-issued SYNOP, METAR, SPECI and TAF
reports, local reporting procedures, receiver profiles and an actual BUFR
download from the test wis2box. ICAO source publications may require access
through the national civil aviation or meteorological authority.
