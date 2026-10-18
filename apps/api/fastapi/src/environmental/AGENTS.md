# environmental domain — agent context

**Owner:** Barrels platform. External forecast data for the GMS public pages;
never a GMS product.

- Marine: Copernicus Marine (`copernicusmarine`). Waves `cmems_mod_glo_wav_anfc_0.083deg_PT3H-i` (GLOBAL_ANALYSISFORECAST_WAV_001_027: VHM0, VHM0_SW1, VTM01_SW1, VMDR_SW1) and SST `cmems_mod_glo_phy_anfc_0.083deg_PT1H-m` (GLOBAL_ANALYSISFORECAST_PHY_001_024: `thetao`, depth 0 to 2 m). Ids are settings (`COPERNICUS_WAVE_DATASET_ID`, `COPERNICUS_SST_DATASET_ID`); both were checked against the live catalogue.
- Air: CAMS global atmospheric composition forecasts on the ADS (`cdsapi`), `uv_biologically_effective_dose` (accumulated J/m2, converted to a step-mean UV index at 0.025 W/m2 per unit) and `dust_aerosol_optical_depth_550nm`. Nearest grid cell (0.4 degree). Run chosen by `providers.latest_cams_run` (00/12 UTC, published about 10 h later).
- Disabled cleanly: `config.marine_enabled` needs `COPERNICUSMARINE_SERVICE_USERNAME` and `_PASSWORD`; `config.air_enabled` needs `CDSAPI_KEY`. Unset means the worker jobs return 0 and endpoints answer `available: false`. Never serve sample data here.
- `parsing.py` is pure xarray (no network); `providers.py` holds the blocking clients (run through `asyncio.to_thread`); `service.py` upserts one `environment.series` row per (kind, point). A failed fetch raises `ProviderError` and leaves the previous row.
- Worker jobs `fetch_marine_environment`, `fetch_air_environment` (`src/worker/main.py`).
- `GET /api/v1/environment/marine|air?point=` public, 60/min, `Cache-Control` with `s-maxage`. `provenance.status` is always `external`, `is_gms_product` always false, `attribution` carries the Copernicus licence text. `stale` after 12 h (`ENVIRONMENT_STALE_AFTER_HOURS`).
- xarray and numpy are imported lazily inside functions; keep it so API startup and the worker health probe stay light.
- Tests: `tests/environmental/` (synthetic xarray datasets, no network).
