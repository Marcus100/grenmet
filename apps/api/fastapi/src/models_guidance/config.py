"""Model-guidance settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class GuidancePoint(BaseModel):
    """A forecast point; ``key`` is the stable id used in the API."""

    key: str = Field(pattern=r"^[a-z0-9-]{2,40}$")
    name: str
    latitude: float = Field(ge=-90, le=90)
    longitude: float = Field(ge=-180, le=180)


# Grenada, Carriacou and Petite Martinique. Coordinates are airfield or
# settlement reference points, snapped to the nearest model grid cell.
DEFAULT_POINTS: tuple[GuidancePoint, ...] = (
    GuidancePoint(
        key="mbia",
        name="Maurice Bishop International Airport (Grenada)",
        latitude=12.004,
        longitude=-61.786,
    ),
    GuidancePoint(
        key="lauriston",
        name="Lauriston Airport (Carriacou)",
        latitude=12.476,
        longitude=-61.472,
    ),
    GuidancePoint(
        key="petite-martinique",
        name="Petite Martinique",
        latitude=12.521,
        longitude=-61.384,
    ),
)


class ModelsGuidanceConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MODELS_GUIDANCE_",
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # OFF by default: the worker downloads hundreds of MB per run.
    ENABLED: bool = False
    #: Comma-separated subset of ``ifs``, ``aifs``, ``gfs``.
    MODELS: str = "ifs,aifs,gfs"
    #: Points to extract; JSON list in the environment.
    POINTS: list[GuidancePoint] = Field(default_factory=lambda: list(DEFAULT_POINTS))
    #: The worker checks every hour at this minute and fetches runs it has not
    #: stored yet (IFS/AIFS appear about 7-9 h, GFS about 5 h after the cycle).
    POLL_MINUTE: int = Field(default=20, ge=0, le=59)
    #: Forecast length in hours (10 days).
    HORIZON_HOURS: int = Field(default=240, ge=24, le=240)
    #: Stored runs older than this are deleted.
    RETENTION_DAYS: int = Field(default=7, ge=1, le=60)
    #: Parent for temporary GRIB downloads; empty uses the system temp dir.
    CACHE_DIR: str = ""
    TIMEOUT_SECONDS: float = Field(default=60.0, gt=0)
    GFS_FILTER_URL: str = "https://nomads.ncep.noaa.gov/cgi-bin/filter_gfs_0p25.pl"
    GFS_DATA_URL: str = "https://nomads.ncep.noaa.gov/pub/data/nccf/com/gfs/prod"
    #: Pause between NOMADS requests (their usage guidance asks for politeness).
    GFS_REQUEST_PAUSE_SECONDS: float = Field(default=0.5, ge=0)

    def enabled_models(self) -> list[str]:
        wanted = [m.strip().lower() for m in self.MODELS.split(",")]
        return [m for m in wanted if m]


guidance_settings = ModelsGuidanceConfig()
