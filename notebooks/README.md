# Notebooks

Weather model download, analysis and MetPy exploration notebooks for Grenada
(TGPY, Maurice Bishop International Airport). Requires Python 3.14 and uv.

## Set up

The notebooks get their own environment in `notebooks/.venv`. Run this from
the repository root; a plain `uv sync --package notebooks` would replace the
API's packages in the shared root `.venv`.

```bash
UV_PROJECT_ENVIRONMENT=notebooks/.venv uv sync --frozen --package notebooks
```

## Open in VS Code

Open this folder (`code notebooks` from the repository root, in WSL), open a
notebook and pick the kernel `.venv/bin/python`. Cells run with the notebook's
own folder as the working directory, so `data/` lands next to each notebook.

JupyterLab also works:
`UV_PROJECT_ENVIRONMENT=notebooks/.venv uv run --frozen --package notebooks jupyter lab`.

## Run order

1. `models/<model>/download.ipynb`: fetches the latest run into
   `models/<model>/data/YYYY-MM-DD_HHZ/` (git-ignored, often hundreds of MB).
2. `models/<model>/analysis.ipynb`: set `RUN_DIR` to that folder; prints the
   TGPY nearest-point tables and writes `canonical_sfc.csv`.
3. `models/ensemble/compare.ipynb`: reads every model's `canonical_sfc.csv`
   and draws the side-by-side heatmap.

| Folder | Model | Source |
| --- | --- | --- |
| `ecmwf_ifs` | ECMWF IFS HRES (deterministic) | ECMWF Open Data |
| `ecmwf_ens` | ECMWF ENS (51 members) | ECMWF Open Data |
| `ecmwf_aifs` | ECMWF AIFS-single (AI deterministic) | ECMWF Open Data |
| `ecmwf_aifs_ens` | ECMWF AIFS-ENS (AI ensemble) | ECMWF Open Data |
| `noaa_gfs` | NOAA GFS | Herbie (NOMADS/AWS) |
| `noaa_gefs` | NOAA GEFS | Herbie (NOMADS/AWS) |

Column names and units shared by every analysis notebook:
[`models/CANONICAL_PARAMS.md`](models/CANONICAL_PARAMS.md).

## MetPy

`metpy/unidata.ipynb` indexes about 1,000 Unidata and MetPy example notebooks
(search by topic, such as `skew` or `radar`). The examples live in
`metpy/sources/`, which is git-ignored; `metpy/manifest.json` records where
each one came from. `metpy/cartopy.ipynb` is a map-drawing starter.

Commit notebooks without outputs (clear all outputs before saving).
