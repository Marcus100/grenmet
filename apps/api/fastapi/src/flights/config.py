"""Flight-board settings. Decoupled from global Settings (fastapi-best-practices)."""

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class FlightsConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # OFF by default. OpenSky is research-only: commercial use needs a written
    # licence and TGPY coverage is unproven
    # (docs/strategy/integration-opportunities.md).
    FLIGHTS_OPENSKY_ENABLED: bool = False
    # Optional OAuth2 client credentials; anonymous access has a tiny quota.
    OPENSKY_CLIENT_ID: str | None = None
    OPENSKY_CLIENT_SECRET: str | None = None
    OPENSKY_API_URL: str = "https://opensky-network.org/api"
    OPENSKY_TOKEN_URL: str = (
        "https://auth.opensky-network.org/auth/realms/opensky-network"
        "/protocol/openid-connect/token"
    )
    OPENSKY_TIMEOUT_SECONDS: float = Field(default=20.0, gt=0)
    # Window requested from OpenSky; its endpoints allow at most 2 days.
    FLIGHTS_WINDOW_HOURS: int = Field(default=48, ge=1, le=48)
    # Must outlive the 30-minute poll so one failed poll does not blank the board.
    FLIGHTS_CACHE_TTL_SECONDS: int = Field(default=6 * 3600, ge=60)


flights_settings = FlightsConfig()

# Airports this domain serves. TGPY = Maurice Bishop International.
SUPPORTED_AIRPORTS: tuple[str, ...] = ("TGPY",)
