"""Environmental-data settings. Decoupled from global Settings."""

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class EnvironmentalConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # Copernicus Marine Service (free account). Both unset = marine disabled.
    COPERNICUSMARINE_SERVICE_USERNAME: str | None = None
    COPERNICUSMARINE_SERVICE_PASSWORD: SecretStr | None = None
    # Global Ocean Waves Analysis and Forecast (GLOBAL_ANALYSISFORECAST_WAV_001_027):
    # 3-hourly instantaneous, 1/12 degree.
    COPERNICUS_WAVE_DATASET_ID: str = "cmems_mod_glo_wav_anfc_0.083deg_PT3H-i"
    # Global Ocean Physics Analysis and Forecast (GLOBAL_ANALYSISFORECAST_PHY_001_024):
    # hourly mean, 1/12 degree; `thetao` at the shallowest level is the SST.
    COPERNICUS_SST_DATASET_ID: str = "cmems_mod_glo_phy_anfc_0.083deg_PT1H-m"

    # Copernicus Atmosphere Data Store (free account). Both unset = air disabled.
    CDSAPI_URL: str = "https://ads.atmosphere.copernicus.eu/api"
    CDSAPI_KEY: SecretStr | None = None
    CAMS_DATASET_ID: str = "cams-global-atmospheric-composition-forecasts"

    # Forecast horizon stored per point.
    ENVIRONMENT_FORECAST_HOURS: int = Field(default=120, ge=24, le=240)
    # Forecasts count as stale after this age (docs: forecasts 12 h).
    ENVIRONMENT_STALE_AFTER_HOURS: int = Field(default=12, ge=1)
    ENVIRONMENT_REQUEST_TIMEOUT_SECONDS: int = Field(default=600, ge=30)

    @property
    def marine_enabled(self) -> bool:
        return bool(
            self.COPERNICUSMARINE_SERVICE_USERNAME
            and self.COPERNICUSMARINE_SERVICE_PASSWORD
            and self.COPERNICUSMARINE_SERVICE_PASSWORD.get_secret_value()
        )

    @property
    def air_enabled(self) -> bool:
        return bool(self.CDSAPI_KEY and self.CDSAPI_KEY.get_secret_value())


environmental_settings = EnvironmentalConfig()
