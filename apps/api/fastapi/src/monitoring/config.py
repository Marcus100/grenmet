from pydantic import SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict

MIN_PROBE_TOKEN_LENGTH = 32


class MonitoringConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_prefix="MONITORING_",
        env_file=".env.local",
        extra="ignore",
        env_ignore_empty=True,
    )
    # Bearer secret for the uptime probe route (Better Stack sends it as a header).
    # Unset, or shorter than 32 characters, the route answers 404 as if absent.
    PROBE_TOKEN: SecretStr | None = None

    def probe_secret(self) -> str | None:
        if self.PROBE_TOKEN is None:
            return None
        value = self.PROBE_TOKEN.get_secret_value()
        return value if len(value) >= MIN_PROBE_TOKEN_LENGTH else None


monitoring_settings = MonitoringConfig()
