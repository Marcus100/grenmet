# Elections Grenada content audit — October 2026

Status: Implemented; validation recorded in the task PR
Owner: Barrels Grenada
Last updated: 2026-10-28

## Route responsibilities

| Route family | Purpose and review outcome |
| --- | --- |
| `/` | Short front-page introduction; dated, incomplete candidate directory coverage. House counts labelled at dissolution. |
| `/2026` | Election dates, voter guidance and campaign entry points; latest register scope/date visible. Removed duplicate House strip. |
| `/updates`, `/updates/[slug]` | Sourced chronology and individual reports; removed duplicate House sidebar. Corrected earlier roll-freeze claim with dated update. |
| `/candidates`, `/candidates/[slug]` | Earlier announced selections, not a complete nominated ballot. Reported nomination totals separated from name coverage. Individual name notes retained. |
| `/constituencies`, `/constituencies/[slug]` | Local historical results and register counts; dated candidate selections with directory limitation. Existing letter redirects retained. |
| `/parties`, `/parties/[code]` | Party history; mixed-source votes marked by measure, including 1990. |
| `/results` | Historical event explorer; existing measure-level evidence controls retained. |
| `/elections`, `/elections/[slug]` | Event archive; available station coverage distinguished from complete coverage. |
| `/referendums` | Referendum archive; denominators and unavailable measures explicit. |
| `/trends`, `/how-close` | Historical comparisons; official-only rankings require official inputs for the measure. |
| `/forecast` | Earlier configured model, with visible limitation against later nomination reporting. Numerical parameters unchanged. |
| `/make-your-map` | Shareable scenarios; explicit earlier provisional DPM configuration and incomplete-ballot limitation. |
| `/register` | Dated aggregate snapshots, addenda and historical occupation labels. Reconciliation explanations centralised at Sources. |
| `/learn`, `/learn/[slug]` | Eight civic guides; official voter search distinguished from registration/corrections and current arrangements. |
| `/sources` | Provenance, conflicting totals, arithmetic residuals and evidence explanations. |
| `/search` | Existing search UI retained; content labels and dated stations/member information corrected in the index. |

Shared reading guides now open on request. The national evidence comparison is
shown once, on Trends. The footer retains product identity and PEO guidance;
evidence symbols open on request. Important data limitations remain visible at
their point of use.

## October import and limits

`python3 scripts/history/import_peo_registers.py` downloads three public PEO PDFs
to temporary storage. It checks page reference dates, unique registration numbers,
complete division sequences and sex columns, then writes only aggregate counts,
document hashes and audit totals. It publishes and retains only aggregate
outputs; source PDFs exist temporarily during extraction.
The importer needs system `pdftotext`; its synthetic tests use the standard library.

- Consolidated reference 16 October: 95,908 non-police records, 134 divisions,
  2,640 pages; F 49,497, M 46,410, U 1. The U meaning is unspecified.
- September addendum: 3,477 entries; all IDs occur in the consolidated file.
- October addendum: 1,026 entries; 1,025 IDs occur in the consolidated file.
  Four IDs occur in both addenda. These are overlapping entries, not net additions.
- The separately dated PEO summary reports 97,020 persons and 132 divisions.
  This remains an unresolved discrepancy, not an adjustment to the PDF count.
- Later secondary reporting attributes 46 nominations to PEO, including NDC 15,
  NNP 15 and DPM 9. The other seven identities and a complete primary nominee
  list have not been verified here. Earlier name records remain dated 4 October.
  They contain ten provisional DPM selections; this conflicts with the later
  reported nine nominees and is not treated as a verified slate by scenario tools.
- Existing map geometry is illustrative; missing divisions are omitted with
  availability explanations. This content pass does not certify official boundaries.

Source URLs and provenance live in the public source records, evidence catalogue
and campaign source tuples. Historical election/referendum/geometry fingerprints
are unchanged; the register and validation fingerprints reflect this import.
