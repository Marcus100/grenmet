# NHC operational products for GMS

Collect current Atlantic/Caribbean NHC guidance into Grenmet using uv. This
package downloads originals, decodes text/maps/grids/aircraft messages, and keeps
every changed version. It does not issue GMS warnings or backfill history.

## Commands

Run from the repository root with Python 3.13+ and uv on Linux or macOS:

```bash
uv run --frozen --package gms-ingest nhc collect
uv run --frozen --package gms-ingest nhc status
uv run --frozen --package gms-ingest nhc point --lat 12.05 --lon -61.75
```

The default archive is `data/gms-ingest/nhc/` inside the checkout, regardless of
working directory. It is ignored by Git. No API key is needed. No timer, service,
backend endpoint, or dashboard is installed.

Collect selected groups or change the archive/decoded grid region:

```bash
uv run --frozen --package gms-ingest nhc collect --groups text,storms
uv run --frozen --package gms-ingest nhc collect --groups maps,charts
uv run --frozen --package gms-ingest nhc collect --groups grids --bbox -65 8 -55 20
uv run --frozen --package gms-ingest nhc collect --groups recon
uv run --frozen --package gms-ingest nhc collect --output-dir /absolute/archive/path
```

The bbox order is **west south east north**; the default is 65–55°W, 8–20°N.
Original GRIB downloads can cover a much larger area. Only the decoded native
cells are clipped. Status and point commands also accept `--output-dir`.

The previous `nhc.py --output-dir ...` entrypoint remains available through uv,
but now runs all product groups and requires the package's decoding dependencies:

```bash
uv run --frozen --package gms-ingest python scripts/gms-ingest/nhc.py --output-dir "$PWD/data/gms-ingest/nhc"
```

If the shared virtual environment is unavailable, select an isolated environment
without changing the workspace or lockfile:

```bash
UV_PROJECT_ENVIRONMENT=/tmp/grenmet-nhc-venv uv run --frozen --package gms-ingest nhc collect
```

## Product groups

| Group | Coverage |
| --- | --- |
| `text` | Atlantic outlook, TWDAT discussion sections, OFFNT3 Caribbean zones, HSFAT2 high-seas bulletin |
| `storms` | Atlantic storm metadata; published public/intermediate advisories, forecast advisories/discussions and wind-probability text |
| `maps` | Atlantic GIS and graphical-outlook feeds; storm tracks/cones, warning areas, wind radii, preliminary tracks, probability/arrival products and linked raster overlays when published |
| `charts` | Western Atlantic/Caribbean surface analysis, wave analysis, 24/48/72-hour wind-wave/surface forecasts, 48/72-hour swell-period charts, seasonal danger or high-wind chart |
| `grids` | NDFD oceanic wind speed/direction, gust, wave height and hazard files for both forecast windows; latest advertised preliminary wind probabilities and active Atlantic storm arrival/departure grids; regional native values and source parameter/cycle metadata |
| `recon` | Current today/tomorrow flight plans, USAF/NOAA HDOB, labelled vortex messages and TEMP DROP profiles |

Text/storm/map/grid collection retrieves the storm/outlook indexes needed for discovery.
Only current registered paths and advertised assets are followed; there is no
recursive site crawl. Products published on storm-specific URLs exist only when
advertised. No-storm indexes are valid results. Image charts are retained as
images, not numerically interpreted. The oceanic NDFD grid includes multiple
forecast offices; originating-centre metadata is retained.

Sources and format references:

- [NHC RSS catalogue](https://www.nhc.noaa.gov/aboutrss.shtml)
- [Current storm metadata](https://www.nhc.noaa.gov/CurrentStorms.json)
- [NHC GIS products](https://www.nhc.noaa.gov/gis/)
- [Marine charts](https://www.nhc.noaa.gov/marine/)
- [NHC/TAFB marine grids](https://www.nhc.noaa.gov/marine/grids.php)
- [Reconnaissance products](https://www.nhc.noaa.gov/recon.php)
- [HDOB specification](https://www.nhc.noaa.gov/abouthdobs_2007.shtml)
- [NOAA TEMP DROP format](https://www.aoml.noaa.gov/hrd/format/tempdrop_format.html)

## Finding the results

`latest.json` is the version-2 product index. Look up a product such as `twdat` in
its `products` object: `decoded_file` points to readable JSON relative to the
archive root, while `source.raw_file` points to the original bytes.

```text
data/gms-ingest/nhc/
  latest.json                    product index and compatible storms/outlook fields
  http-cache.json                HTTP validators and original-object references
  objects/<sha256>               original bytes, deduplicated across products/runs
  decoded/<key>/result.json      normalized output and metadata
  decoded/<key>/bulletin.txt     readable bulletin when freshly text-decoded
  decoded/<key>/features.geojson vector products, when applicable
  decoded/<key>/grid.nc          regional scientific grid, when applicable
  runs/<UTC-id>/manifest.json    each invocation's product outcomes and errors
```

Decoded keys include the original hash, decoder version, type and bbox. Original
files are immutable and not deleted automatically. Older version-1 run folders
and `/tmp` archives are not moved or rewritten. Plan disk space and backups before
scheduling repeated collection.

A successful product records URL, checksum, retrieval/publication times, decoding
status, and artifact references. Unknown issue times stay null. Qualified outlook
probabilities preserve their exact wording; “near 0” does not become exact zero.
TWDAT sections and marine zone bodies remain verbatim alongside the full text.

Maps become WGS84 GeoJSON; raster overlays and embedded images retain asset links.
Grid values retain original units and hazard codes. `point` returns each forecast
record's nearest valid native cell, its coordinates/distance, source cycle, units,
and value; it rejects locations outside the decoded bbox and does not interpolate.
Missing values remain missing. TEMP DROP profiles retain pressure, temperature,
dewpoint and winds; encoded mandatory-level heights and supplementary/QC groups
remain available as source codes. HDOB flight-level measurements are distinct from
SFMR surface estimates. Vortex letter fields are preserved alongside decoded
centre time/position and selected pressure/wind fields.

## Failures, freshness and operating limits

Each product publishes independently. A failed download or decoder preserves the
previous successful decoded artifact and marks the product failed. Raw downloaded
bytes survive decoding failure. Inspect `decoded_source_sha256` when the latest raw
response differs from the retained decoded version. Inactive storms and seasonal
charts and assets removed from successfully refreshed discovery indexes are marked inactive. Optional absent assets return `unavailable`; other
404 responses are failures, not evidence of inactivity.

A run exits **0** when requested applicable products succeed, **1** for partial or
failed work, and **2** for argument errors. Inspect `nhc status` and the run manifest
for details. A filesystem failure may prevent publishing the manifest/index.
The OS lock prevents overlapping runs against the same archive and is released
when the process exits; do not delete its lock file.

“Latest” means last successfully collected, not guaranteed current. Issue time,
retrieval time and last attempt are separate. Age indicators use 12 hours for
text/storm/map products, 24 hours for charts, 18 hours for grids and 6 hours for
reconnaissance; unknown issue times have unknown freshness. These are inspection
indicators, not approved operational thresholds. Manual runs only capture messages
available when invoked, so intervening reconnaissance messages may be missed.

Downloads use conditional HTTP requests, 20-second socket timeouts and up to three
attempts for transient errors. Retry-After is honoured up to 60 seconds; longer
server deferrals are reported for a later run. Limits are 10 MiB for feeds/text,
100 MiB for images/vectors, 1 GiB per grid file, 4 GiB per invocation and 500
discovered products. Each download is limited to ten minutes. Archives are read
without extracting paths and have separate decompressed-size/member limits.

## Verification

```bash
uv run --frozen --package gms-ingest python -m unittest discover -s scripts/gms-ingest/tests -v
pnpm fix
pnpm type-check
```

Tests exercise parsing, conditional requests, partial publication, archive reuse,
vector conversion, real synthetic GRIB decoding/point queries, and reconnaissance
fields. Live checks use current products; labelled historical samples used for
format verification belong in temporary test directories, not the operational index.
