from pydantic_settings import BaseSettings, SettingsConfigDict


class RewardsConfig(BaseSettings):
    """Rewards settings loaded from REWARDS_* environment variables."""

    model_config = SettingsConfigDict(
        env_prefix="REWARDS_",
        env_file=".env.local",
        env_ignore_empty=True,
        extra="ignore",
    )

    #: Velocity rule: more earn entries than this inside the window flags the
    #: account for review (the entries are still recorded).
    VELOCITY_MAX_EARNS: int = 10
    VELOCITY_WINDOW_MINUTES: int = 60
    #: How far back the Events sync looks for admissions to credit.
    SYNC_LOOKBACK_DAYS: int = 30
    SYNC_BATCH_SIZE: int = 500


rewards_settings = RewardsConfig()
