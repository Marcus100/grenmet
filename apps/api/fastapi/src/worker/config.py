"""Background-worker settings (arq + Redis). Decoupled from global Settings.

When REDIS_URL is unset the app falls back to in-memory rate limiting and the worker
uses a localhost default; set it in staging/prod for the shared Redis instance.
"""

from pydantic import field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class WorkerConfig(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    # When None: rate limiting stays in-memory; worker defaults to localhost.
    REDIS_URL: str | None = None
    CAP_JOB_BATCH_SIZE: int = 20
    CAP_JOB_MAX_ATTEMPTS: int = 5
    CAP_JOB_POLL_SECONDS: int = 10

    @field_validator("CAP_JOB_POLL_SECONDS")
    @classmethod
    def _poll_must_divide_60(cls, value: int) -> int:
        # The arq cron schedule uses second=range(0, 60, POLL); a value that does
        # not divide 60 skews the cadence (e.g. 7 → fires at 0,7,...,56 then jumps).
        if value <= 0 or 60 % value != 0:
            raise ValueError("CAP_JOB_POLL_SECONDS must be a positive divisor of 60")
        return value

    @property
    def redis_dsn(self) -> str:
        return self.REDIS_URL or "redis://localhost:6379/0"


worker_settings = WorkerConfig()
