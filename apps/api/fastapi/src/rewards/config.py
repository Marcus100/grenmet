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
    #: Stamp gifting hard switch (ADR-0030). Off by default and refused in
    #: ENVIRONMENT=production whatever the feature flag says, until an accountant
    #: and legal sign off.
    GIFTING_ENABLED: bool = False
    GIFT_DAILY_CAP_PER_SENDER: int = 3
    GIFT_LIFETIME_CAP_PER_RECIPIENT: int = 10
    GIFT_REVERSAL_HOURS: int = 24
    LEADERBOARD_MIN_COHORT: int = 10
    LEADERBOARD_MAX_ROWS: int = 50


rewards_settings = RewardsConfig()
