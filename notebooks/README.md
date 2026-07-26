# Notebooks

Data and exploration notebooks for Grenmet (e.g. cartopy, ECMWF Open Data). Requires Python 3.13+.

From this directory:

```bash
uv sync --frozen --package notebooks
uv run --frozen --package notebooks jupyter lab
# or: uv run --frozen --package notebooks notebook
```

See [pyproject.toml](pyproject.toml) for dependencies.
