# PRIC tide-gauge data tools

Reproducible acquisition and audit tooling for the Prickly Bay, Grenada tide
gauge. Source observations remain under `raw/`; generated audit and
release-separated derivative files go under `outputs/`.

## Source identifiers

| System | Identifier |
|---|---|
| IOC/SLSMF | `pric` |
| IOC station catalogue | `SSC-pric` |
| UHSLC | station `789`, research-quality record `789A` |
| PSMSL | station `2272` (old identifier `893/001`) |

## Commands

Archive all public authoritative artifacts:

```powershell
python tools/tides/collect_pric.py --direct --strict
```

Audit the UHSLC hourly releases and create a release-separated candidate series:

```powershell
python tools/tides/audit_pric.py RAW_SNAPSHOT --output OUTPUT_DIRECTORY
```

Audit the PSMSL/NOC original-frequency annual ZIPs:

```powershell
python tools/tides/audit_pric_hf.py RAW_SNAPSHOT --output AUDIT_JSON
```

Archive timestamped IOC research data when an API key has been provisioned:

```powershell
$env:IOC_SEALEVEL_API_KEY = [Environment]::GetEnvironmentVariable(
  "IOC_SEALEVEL_API_KEY", "User"
)
python tools/tides/collect_ioc_pric.py --direct --start 2011-05-10
```

The authenticated collector defaults to native IOC timestamps, retains every
QC flag, disables all endpoint filters, and writes immutable JSON pages with
SHA-256 checksums. Use a fixed `--snapshot-id` together with `--resume` to
continue an interrupted multi-year download. Do not enable
`--fit-to-sample-rate` for source custody; that API transformation rounds
timestamps into expected slots and can average collisions.
The command defaults to 30-day pages because year-sized native-resolution
responses can exceed practical API preparation and transfer time.
It uses three concurrent workers by default, bounded to the three requested
PRIC water-level sensors; `--workers` is restricted to 1-4.

Audit completed or partial authenticated research pages without modifying the
raw archive:

```powershell
python tools/tides/audit_ioc_pric_research.py SNAPSHOT --output AUDIT_JSON
```

Verify any collected snapshot:

```powershell
python tools/tides/verify_snapshot.py RAW_SNAPSHOT
```

Summarize raw observed extrema in an archived IOC live window:

```powershell
python tools/tides/summarize_ioc_live.py INPUT_HTML --output OUTPUT_JSON
```

These are window extrema, not verified tidal high/low events.

Build the internally validated July–August 2026 astronomical tide table:

```powershell
tools\.venv\Scripts\python.exe tools/tides/build_pric_tide_table.py `
  --rq-csv RAW_RQ_HOURLY_CSV `
  --ioc-live-html RAW_IOC_30_DAY_HTML `
  --uhslc-calendar RAW_UHSLC_JULY_CALENDAR `
  --uhslc-calendar RAW_UHSLC_AUGUST_CALENDAR `
  --output-dir OUTPUT_DIRECTORY `
  --start 2026-07-01 `
  --stop 2026-08-31
```

The builder:

- fits only UHSLC research-quality observations;
- compares 8-, 15-, 30-, and automatically selected constituent sets on a
  withheld 2020–2024 block;
- checks July against provisional IOC radar and bubbler observations;
- compares every event with UHSLC's published monthly calendars;
- writes AST/UTC event tables, full-precision minute predictions, coefficients,
  validation results, complete run metadata, and a SHA-256 artifact manifest.

Do not put the API key in a command committed to the repository or in a
manifest. `collect_ioc_pric.py` never writes the key.

## PRIC-primary August–September model

Build the model from the archived native IOC PRIC observations, using radar as
the primary fit and bubbler as the independent local validation sensor:

```powershell
tools\.venv\Scripts\python.exe tools/tides/build_pric_ioc_tide_table.py `
  --snapshot raw/02-atmosphere-aviation/datasets/tide-gauges/pric/ioc-api-snapshots/20260818T033858Z `
  --audit outputs/tides/pric/ioc-full-audit-20260818.json `
  --rq-csv raw/02-atmosphere-aviation/datasets/tide-gauges/pric/snapshots/20260726T132000Z/uhslc/rq/hourly/h789a.csv `
  --uhslc-calendar raw/02-atmosphere-aviation/datasets/tide-gauges/pric/snapshots/20260726T170000Z/uhslc/predictions/t789_202608_m.txt `
  --output-dir exports/02-atmosphere-aviation/meteorology-and-climate/tides/pric/2026-august-september-v1.1-pric-primary `
  --start 2026-08-01 `
  --stop 2026-09-30
```

The builder:

- filters every IOC QC flag before fitting;
- labels hourly medians at the `HH:30` interval midpoint;
- selects among 8-, 15-, 30-, and automatic-constituent UTide models on a
  held-out 2020–2024 PRIC radar block;
- verifies August 1 onward with a pre-August model against native radar and
  bubbler observations;
- uses UHSLC only for a provisional datum crosswalk and independent calendar
  comparison;
- emits AST/UTC events, one-minute predictions, coefficients, validation,
  run metadata, and a SHA-256 artifact manifest.

Pressure remains archived but is excluded from fitting because its full-record
QC and level regime are unstable.

## Release boundary

- UHSLC research-quality (`RQ`) is the training authority.
- UHSLC fast-delivery (`FD`) is a provisional extension and is never relabelled
  as RQ.
- IOC research data is retained sensor-by-sensor with flags. Filtering is a
  downstream, versioned decision.
- IOC live telemetry and PSMSL/NOC automatic QC are diagnostic sources.
- All heights remain in their source datum until an explicit, reviewed datum
  transformation is approved.

None of these tools creates an official GMS tide product. Operational release
requires the gates in
`models/gms/pric-tide-prediction/pric-data-and-model-spec-v0.1-2026-07-26.md`.
