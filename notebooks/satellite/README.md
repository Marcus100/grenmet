# Satellite notebooks

`goes19_gfs_grenada.ipynb` shows what GeoNetCast Americas (GNC-A) satellite data can do for forecasters in Grenada:

- latest GOES-19 ABI band 13 (infrared) and band 8 (water vapour), cropped to lon -66..-56, lat 9..18, with the scan time in UTC
- GFS 0.25 degree mean sea level pressure and 850 hPa wind barbs at 0, 24 and 48 hours, and accumulated rain at 24 and 48 hours (no accumulation exists at 0 hours)

These are research outputs, not operational products.

## Run

From the repository root, using the notebooks' own environment (a plain
`uv run --package notebooks` would install these packages into the shared root
`.venv` the API uses):

```bash
UV_PROJECT_ENVIRONMENT=notebooks/.venv uv run --frozen --package notebooks jupyter lab
```

Open `notebooks/satellite/goes19_gfs_grenada.ipynb` and run all cells. Network access is needed. The notebook must run with `notebooks/satellite` as its working directory so downloads land in `notebooks/satellite/data/`: Jupyter does this by default; for `nbconvert`, `cd notebooks/satellite` first.

## Data source

GNC-A rebroadcasts the same NOAA GOES-19 `ABI-L2-CMIPF` netCDF files that are in the public AWS bucket `noaa-goes19`. By default the notebook reads that bucket anonymously.

To read the receiver's files instead, set `SOURCE_DIR` in the parameters cell to the FAZZT output folder (any depth; files matching `*ABI-L2-CMIPF*C<band>_G19*.nc`, with the band zero-padded to two digits such as `C08` or `C13`, are searched and the newest scan is used):

```python
SOURCE_DIR = Path("/path/to/fazzt/output")
```

Downloads are cached in `notebooks/satellite/data/` and are not committed.
