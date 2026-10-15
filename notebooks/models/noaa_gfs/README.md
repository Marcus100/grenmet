# GFS download identity

Run `download.ipynb` with this directory as the notebook working directory.
Keep each GRIB file together with its `<filename>.metadata.json` sidecar when
copying downloaded data. Run folders and GRIB filenames are unchanged.

The sidecar schema (version 1) records `model`, `product`, UTC
`initialization_time`, `requested_field_filter`, and `requested_forecasts`.
Each forecast has a `forecast_hour` and UTC `valid_time`, calculated as
initialization plus forecast hours. For example, the 18Z run on January 31
at hour 6 is valid at `2026-02-01T00:00:00Z`. The 00Z run on February 1 at
hour 0 has the same valid time, but a different initialization and identity.

Atmospheric files record `gfs` / `pgrb2.0p25`; wave files record
`gfs_wave` / `global.0p25`. The download helpers use one fixed UTC
initialization for retrieval and metadata. Herbie receives its naive UTC
representation; the sidecar always includes an explicit `Z` timezone.

These are **requested** fields and forecast times. They do not certify which
GRIB messages arrived, completeness, units, or accumulation intervals.
Checking the downloaded GRIB contents is the next increment.

Metadata is published through a temporary file in the destination directory
and atomic replacement. Failures propagate, including in the optional
reflectivity cell. Before replacing GRIB bytes, the helpers remove any old
sidecar so a failed replacement cannot leave stale identity. A failure before
replacement preserves the previous GRIB and sidecar. A GRIB without its
sidecar is an incomplete download; rerun the download to recover it.

Run the offline tests from the repository root (no notebook dependencies or
network downloads required):

```bash
python -m unittest discover -s notebooks/tests -v
```
