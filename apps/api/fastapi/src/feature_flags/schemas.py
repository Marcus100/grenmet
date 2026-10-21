import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from pydantic import AfterValidator, Field

from src.models import BaseModel, UtcDateTime

KEY_PATTERN = r"^[a-z0-9]+(-[a-z0-9]+)*$"
_KEY = r"[a-z0-9]+(?:-[a-z0-9]+)*"
MAX_PUBLIC_KEYS = 20
# Comma-separated flag keys, at most MAX_PUBLIC_KEYS (enforced by the regex, so
# FastAPI answers 422 without extra code).
PUBLIC_KEYS_PATTERN = rf"^{_KEY}(,{_KEY}){{0,{MAX_PUBLIC_KEYS - 1}}}$"

type Environment = Literal["local", "staging", "production"]


def _naive_utc(value: datetime | None) -> datetime | None:
    """Columns hold naive UTC (``src.utils.datetime.utc_now``)."""
    if value is not None and value.tzinfo is not None:
        return value.astimezone(UTC).replace(tzinfo=None)
    return value


# UtcDateTime only changes how a value is serialised; on input the validator
# below still stores naive UTC.
InputDateTime = Annotated[UtcDateTime | None, AfterValidator(_naive_utc)]


class FeatureFlagAudience(BaseModel):
    """Who a flag is on for. Any matching rule includes the subject; the
    environment allowlist (when not empty) gates all of them."""

    everyone: bool = False
    organisation_ids: list[Annotated[str, Field(min_length=1, max_length=100)]] = Field(
        default_factory=list, max_length=200
    )
    user_ids: list[uuid.UUID] = Field(default_factory=list, max_length=500)
    percentage: int | None = Field(default=None, ge=0, le=100)
    environments: list[Environment] = Field(default_factory=list, max_length=3)


class FeatureFlagCreate(BaseModel):
    key: str = Field(min_length=1, max_length=80, pattern=KEY_PATTERN)
    description: str = Field(default="", max_length=2000)
    enabled: bool = False
    exposed: bool = False
    audience: FeatureFlagAudience = Field(default_factory=FeatureFlagAudience)
    success_metric: str | None = Field(default=None, max_length=4000)
    owner: str | None = Field(default=None, max_length=255)
    expires_at: InputDateTime = None
    review_by: InputDateTime = None


class FeatureFlagUpdate(BaseModel):
    """Partial update; send ``null`` to clear a nullable field. The key is immutable."""

    description: str | None = Field(default=None, max_length=2000)
    enabled: bool | None = None
    exposed: bool | None = None
    audience: FeatureFlagAudience | None = None
    success_metric: str | None = Field(default=None, max_length=4000)
    owner: str | None = Field(default=None, max_length=255)
    expires_at: InputDateTime = None
    review_by: InputDateTime = None


class FeatureFlagAdmin(BaseModel):
    id: str
    key: str
    description: str
    enabled: bool
    exposed: bool
    audience: FeatureFlagAudience
    success_metric: str | None
    owner: str | None
    expires_at: UtcDateTime | None
    review_by: UtcDateTime | None
    stale: bool
    created_at: UtcDateTime
    updated_at: UtcDateTime


class FeatureFlagAdminList(BaseModel):
    data: list[FeatureFlagAdmin]
    count: int


class FeatureFlagEvaluation(BaseModel):
    """Flag key to on/off for the caller. Only flags marked exposed appear."""

    flags: dict[str, bool]
