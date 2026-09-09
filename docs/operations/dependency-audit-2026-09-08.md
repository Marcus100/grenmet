# Dependency audit — September 8, 2026

Registry comparison of all 281 registry packages in the pre-framework-upgrade
uv lockfile found 125 version differences. The installed environment alone had
67 outdated packages and would miss notebook/geospatial dependencies. These are
version differences, not 125 security findings or confirmed compatible upgrades.
All six Python workspace member manifests and the root manifest were reviewed.
`pnpm outdated -r --format json` found nine JavaScript dependency differences.

## Priorities and compatibility holds

1. FastAPI 0.141.1 / Starlette 1.6.0: current security remediation candidate.
   Locking this pair also adds pydantic-extra-types, required by the standard extra.
   Full API regression and real container security acceptance are required.
2. Small JavaScript updates below: review changelogs and release-age eligibility
   in a separate patch after the security batch passes staging. Do not bypass
   the existing minimum-release-age policy just to reach registry latest.
3. Python service updates: prioritize Pydantic, psycopg, SQLModel/Alembic and
   observability in coherent batches with database/auth regressions; update
   boto3/botocore together across API, scraper, notebooks and geonetcast.
4. Hold bcrypt 5, Redis 8, GraphQL 17 and Plotly 7 for explicit compatibility
   testing. Keep Node types on 24 to match runtime. Keep CMS migration TypeScript
   on JavaScript 6 for Payload tooling; application type-checking uses 7.
5. Keep GDAL 3.6.2 aligned with native libgdal; geospatial Python/native library
   upgrades need container-level validation. Do not force a registry-latest pin.
6. uv 0.12.10 and pnpm 12.3.4 are installed and match registry latest at audit
   time. API/devcontainer images still pin uv 0.11.26 by digest. Align image and
   CI tool versions in a dedicated validated update; retain immutable digests.
   GitHub setup-uv calls currently omit an explicit uv version.

This audit does not change vendored SURFACE/wis2box dependency ownership.
The tables are a dated backlog; recheck registries before each update batch.

## JavaScript differences

| Package | Installed | Registry latest |
| --- | --- | --- |
| @algolia/autocomplete-core | 1.19.9 | 1.19.10 |
| @kubb/plugin-zod | 5.1.3 | 5.1.4 |
| cn | 0.2.5 | 0.2.6 |
| posthog-node | 5.51.6 | 5.51.7 |
| lucide-react | 1.41.0 | 1.42.0 |
| posthog-js | 1.427.2 | 1.428.0 |
| @types/node | 24.13.3 | 26.5.0 |
| graphql | 16.14.2 | 17.0.2 |
| typescript | 6.0.3 | 7.0.2 |

## Python lockfile differences

| Package | Locked before framework update | Registry latest |
| --- | --- | --- |
| alembic | 1.18.5 | 1.19.2 |
| annotated-doc | 0.0.4 | 0.0.5 |
| annotated-types | 0.7.0 | 0.8.0 |
| anyio | 4.14.2 | 4.15.1 |
| appnope | 0.1.4 | 1.0.0 |
| argon2-cffi-bindings | 25.1.0 | 26.1.0 |
| ast-serialize | 0.6.0 | 0.11.0 |
| bcrypt | 4.3.0 | 5.0.0 |
| bokeh | 3.9.1 | 3.10.0 |
| boto3 | 1.43.42 | 1.43.89 |
| botocore | 1.43.42 | 1.43.89 |
| bytecode | 0.18.1 | 0.19.0 |
| certifi | 2026.6.17 | 2026.7.22 |
| cffi | 2.1.0 | 2.1.1 |
| charset-normalizer | 3.4.9 | 3.5.1 |
| click | 8.4.2 | 8.5.0 |
| coverage | 7.15.2 | 7.16.0 |
| cssselect | 1.4.0 | 1.5.0 |
| dask | 2026.7.1 | 2026.8.0 |
| ddtrace | 4.11.1 | 4.14.0 |
| detect-installer | 0.1.0 | 0.2.1 |
| eccodes | 2.47.0 | 2.48.0 |
| eccodeslib | 2.48.0.26 | 2.48.2.27 |
| eckitlib | 2.1.1.26 | 2.2.0.27 |
| ecmwf-datastores-client | 0.5.1 | 0.5.3 |
| ecmwf-opendata | 0.3.31 | 0.3.34 |
| fakeredis | 2.37.0 | 2.37.1 |
| fastapi | 0.115.14 | 0.141.1 |
| fastapi-cloud-cli | 0.22.2 | 0.25.0 |
| fastar | 0.11.0 | 0.12.0 |
| fastjsonschema | 2.21.2 | 2.22.2 |
| feedparser | 6.0.12 | 6.0.14 |
| filelock | 3.31.0 | 3.32.5 |
| fonttools | 4.63.0 | 4.64.0 |
| fpdf2 | 2.8.7 | 2.8.8 |
| fsspec | 2026.6.0 | 2026.7.0 |
| gdal | 3.6.2 | 3.13.3 |
| greenlet | 3.5.3 | 3.5.5 |
| hiredis | 3.4.0 | 3.4.1 |
| holoviews | 1.23.1 | 1.23.2 |
| idna | 3.18 | 3.19 |
| imageio | 2.37.3 | 2.37.4 |
| ipython | 9.15.0 | 9.17.1 |
| ipywidgets | 8.1.8 | 8.1.9 |
| joblib | 1.5.3 | 1.6.0 |
| jupyter-builder | 1.1.1 | 1.2.3 |
| jupyter-client | 8.9.1 | 8.10.0 |
| jupyter-server | 2.20.0 | 2.21.0 |
| jupyterlab | 4.6.1 | 4.6.3 |
| jupyterlab-widgets | 3.0.16 | 3.0.17 |
| kiwisolver | 1.5.0 | 1.5.1 |
| librt | 0.13.0 | 0.15.0 |
| linkify-it-py | 2.1.0 | 2.2.0 |
| lxml | 6.1.1 | 6.1.3 |
| mako | 1.3.12 | 1.4.1 |
| markdown | 3.10.2 | 3.10.3 |
| mistune | 3.3.3 | 3.3.4 |
| mypy | 2.1.0 | 2.3.1 |
| narwhals | 2.24.0 | 2.26.0 |
| nbformat | 5.10.4 | 5.11.1 |
| nh3 | 0.3.6 | 0.3.7 |
| notebook | 7.6.0 | 7.6.2 |
| numpy | 2.5.1 | 2.5.3 |
| nvidia-nccl-cu12 | 2.30.7 | 2.31.2 |
| packaging | 26.2 | 26.3 |
| pandas | 3.0.3 | 3.0.5 |
| panel | 1.9.3 | 1.9.4 |
| panel-material-ui | 0.14.0 | 0.14.2 |
| param | 2.4.1 | 2.4.2 |
| patsy | 1.0.2 | 1.0.3 |
| platformdirs | 4.10.0 | 4.11.7 |
| plotly | 6.9.0 | 7.0.0 |
| pre-commit | 4.6.0 | 4.6.2 |
| prometheus-client | 0.25.0 | 0.26.0 |
| prompt-toolkit | 3.0.52 | 3.0.53 |
| protobuf | 7.35.1 | 7.36.1 |
| psycopg | 3.3.4 | 3.3.5 |
| psycopg-binary | 3.3.4 | 3.3.5 |
| pydantic | 2.13.4 | 2.13.5 |
| pydantic-core | 2.46.4 | 2.48.0 |
| pydantic-settings | 2.14.2 | 2.15.0 |
| pygments | 2.20.0 | 2.21.0 |
| pyproj | 3.7.2 | 3.8.0 |
| pyshp | 3.1.4 | 3.1.6 |
| python-discovery | 1.4.4 | 1.6.0 |
| python-dotenv | 1.2.2 | 1.2.3 |
| python-json-logger | 4.1.0 | 4.2.0 |
| pytz | 2023.4 | 2026.3.post1 |
| pyzmq | 27.1.0 | 27.2.0 |
| queuelib | 1.9.0 | 1.10.0 |
| redis | 5.3.1 | 8.1.0 |
| resend | 2.34.0 | 2.43.0 |
| rich-toolkit | 0.20.3 | 0.20.5 |
| rignore | 0.8.0 | 0.8.1 |
| ruff | 0.15.22 | 0.16.6 |
| s3transfer | 0.19.0 | 0.19.2 |
| scalar-fastapi | 1.8.2 | 1.9.0 |
| scipy | 1.18.0 | 1.18.1 |
| scrapy | 2.17.0 | 2.18.0 |
| sentry-sdk | 2.66.0 | 2.69.1 |
| siphon | 0.10.0 | 0.11.0 |
| soupsieve | 2.9 | 2.9.2 |
| sqlalchemy | 2.0.51 | 2.0.52 |
| sqlmodel | 0.0.39 | 0.0.42 |
| starlette | 0.46.2 | 1.6.0 |
| statsmodels | 0.14.6 | 0.15.0 |
| stripe | 15.3.1 | 15.6.1 |
| tldextract | 5.3.1 | 5.3.2 |
| tornado | 6.5.7 | 6.5.8 |
| tqdm | 4.69.0 | 4.70.0 |
| traitlets | 5.15.1 | 5.16.1 |
| typer | 0.27.0 | 0.27.2 |
| typing-inspection | 0.4.2 | 0.4.4 |
| tzdata | 2026.2 | 2026.3 |
| uvicorn | 0.51.0 | 0.52.4 |
| virtualenv | 21.6.1 | 21.7.8 |
| wcwidth | 0.8.2 | 0.8.3 |
| webencodings | 0.5.1 | 0.6.1 |
| websocket-client | 1.9.0 | 1.9.2 |
| websockets | 16.1.1 | 17.1 |
| widgetsnbextension | 4.0.15 | 4.0.16 |
| wrapt | 2.2.2 | 2.4.0 |
| xgboost | 3.3.0 | 3.4.1 |
| xyzservices | 2026.3.0 | 2026.9.1 |
| zope-interface | 8.5 | 8.6 |

Sources: [PyPI](https://pypi.org/), [npm registry](https://www.npmjs.com/), [FastAPI release notes](https://fastapi.tiangolo.com/release-notes/), [Starlette release notes](https://starlette.dev/release-notes/).
