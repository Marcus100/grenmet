# WMO weather reference in GAA-admin

Staff can search the WMO reference below the composer at `/wxproducts/aviation`.
It contains a selected subset of 34 BUFR observation descriptors, their units,
base encoding metadata, code meanings and notes; five top-level report sequences;
and SYNOP, METAR and SPECI classifications from Common Code Table C13.
Search accepts names, code meanings and compact or separated F-X-Y identifiers.

The source is BUFR edition 4 table version 46 and Common Code Tables effective
2026-06-01. Reserved values, missing values and code-table headings are retained.
Encoding widths and scales are reference information, not meteorological quality
limits. Numeric BUFR code figures must not be substituted for traditional aviation
text groups. Sequence listings retain order and replication but are not recursively
expanded and cannot be used as an encoder.

## Regeneration

From the repository root, with the supplied source folders available:

```bash
python3 apps/web/gaa-admin/scripts/import-wmo-reference.py
pnpm fix
python3 apps/web/gaa-admin/scripts/import-wmo-reference.py --check
pnpm type-check
```

The importer accepts `--bufr` and `--cct` directories. It deliberately pins the
reference version; adopting a different release requires reviewing the selection
and version checks. The generated JSON includes source SHA-256 hashes and original
MIT licences. `--check` compares parsed content so formatting does not cause drift.
The application imports this snapshot and never reads `temp-files` at runtime.

## Codebase findings and IWXXM integration

The aviation composer currently stores browser drafts. The database schema folder
has BUFR/SYNOP models and TypeScript representations of IWXXM concepts, but these
are not an operational TAC converter or WMO XSD/Schematron validator. Public GMS
aviation pages still contain examples and were not connected to draft data.

The following user-supplied projects were inspected on 2026-09-10:

- [WMO IWXXM](https://github.com/wmo-im/iwxxm) supplies XML schemas and Schematron
  rules. Its `LATEST_VERSION` file currently identifies `2025-2`. Use an explicitly
  agreed exchange version rather than following the master branch at runtime.
- [TAC-to-IWXXM](https://github.com/EMPIRIC2/TAC-to-IWXXM) separates conversion,
  TAC linting and XML validation into Python packages. Its
  [tac2iwxxm README](https://github.com/EMPIRIC2/TAC-to-IWXXM/tree/main/packages/tac2iwxxm)
  documents METAR, SPECI and TAF support and Python 3.12 or newer without requiring
  its FastAPI application or database.
- The [iwxxm-validate README](https://github.com/EMPIRIC2/TAC-to-IWXXM/tree/main/packages/iwxxm-validate)
  states that some Schematron dialects can be skipped on the pure-Python path.
  An overall `ok` must not be treated as full conformance when required validation
  stages are skipped. This is a concrete integration concern to test.

A future conversion feature should run locally behind GAA authentication, pin the
converter and schema versions, retain the original TAC and each validation-stage
result, and test METAR/SPECI/TAF output against the official WMO example corpus
(including correction, NIL, cancellation and forecast changes). Failed or skipped
required stages must not produce a fully validated status. Station metadata and
the agreed operational exchange profile also need verification. Neither external
service receives draft text from the reference panel. No converter dependency,
conversion endpoint, transmission or operational validation was added in this change.
