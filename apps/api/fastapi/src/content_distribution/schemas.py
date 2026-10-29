"""API shapes. The CMS body is camelCase (the contract the CMS hook builds);
responses are snake_case like the rest of the API."""

import uuid
from datetime import UTC, datetime
from typing import Literal

from pydantic import Field, field_validator

from src.models import BaseModel, UtcDateTime

Platform = Literal["facebook", "instagram", "whatsapp"]
DisplayStatus = Literal["pending", "scheduled", "dry_run_sent", "failed", "dead"]
URL_PATTERN = r"^https://[^\s]{4,1990}$"


class Captions(BaseModel):
    facebook: str | None = Field(default=None, max_length=2200)
    instagram: str | None = Field(default=None, max_length=2200)
    whatsapp: str | None = Field(default=None, max_length=2200)

    def for_platform(self, platform: str) -> str | None:
        by_platform: dict[str, str | None] = {
            "facebook": self.facebook,
            "instagram": self.instagram,
            "whatsapp": self.whatsapp,
        }
        return by_platform.get(platform)


class PostIn(BaseModel):
    """What the CMS sends when an editor approves a post for social."""

    collection: str = Field(pattern=r"^[a-z][a-z0-9-]{1,59}$")
    slug: str = Field(pattern=r"^[a-z0-9][a-z0-9-]{0,199}$")
    url: str = Field(pattern=URL_PATTERN, max_length=2000)
    title: str = Field(min_length=1, max_length=300)
    summary: str = Field(default="", max_length=1000)
    captions: Captions
    platforms: list[Platform] = Field(min_length=1, max_length=3)
    publish_at: UtcDateTime = Field(alias="publishAt")
    image_url: str | None = Field(
        default=None, alias="imageUrl", pattern=URL_PATTERN, max_length=2000
    )

    @field_validator("platforms")
    @classmethod
    def _platforms_unique(cls, platforms: list[Platform]) -> list[Platform]:
        if len(set(platforms)) != len(platforms):
            raise ValueError("platforms must not repeat")
        return platforms

    @field_validator("publish_at")
    @classmethod
    def _to_naive_utc(cls, moment: datetime) -> datetime:
        # Stored as naive UTC, like every other timestamp in the API. A value
        # without a zone is taken as UTC.
        if moment.tzinfo is not None:
            moment = moment.astimezone(UTC)
        return moment.replace(tzinfo=None)


class DeliveryOutcome(BaseModel):
    platform: Platform
    status: str
    outcome: Literal["created", "updated", "unchanged"]


class PostAccepted(BaseModel):
    ok: bool = True
    deliveries: list[DeliveryOutcome]


class DeliveryAdmin(BaseModel):
    id: uuid.UUID
    collection: str
    slug: str
    platform: str
    url: str
    title: str
    status: DisplayStatus
    automated: bool
    attempts: int
    external_id: str | None
    error: str | None
    publish_at: UtcDateTime
    processed_at: UtcDateTime | None
    updated_at: UtcDateTime


class DeliveryAdminList(BaseModel):
    data: list[DeliveryAdmin]
    count: int
