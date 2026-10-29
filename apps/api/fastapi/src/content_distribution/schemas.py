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
# A post slug is `/`-separated segments such as `stories/2026/10/title`. Each
# segment is lowercase letters, digits and hyphens, starting with a letter or
# digit, so there are no empty segments, no leading or trailing slash and no
# dots. Length is capped separately (max_length=200) so the dedupe key fits.
SLUG_PATTERN = r"^[a-z0-9][a-z0-9-]*(?:/[a-z0-9][a-z0-9-]*)*$"
SLUG_MAX_LENGTH = 200


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
    slug: str = Field(pattern=SLUG_PATTERN, max_length=SLUG_MAX_LENGTH)
    url: str = Field(pattern=URL_PATTERN, max_length=2000)
    title: str = Field(min_length=1, max_length=300)
    summary: str = Field(default="", max_length=1000)
    captions: Captions
    platforms: list[Platform] = Field(min_length=1, max_length=3)
    # Null or missing means "as soon as possible": the service stores the time the
    # post arrived, so the next release queues it (see service.upsert_post).
    publish_at: UtcDateTime | None = Field(default=None, alias="publishAt")
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
    def _to_naive_utc(cls, moment: datetime | None) -> datetime | None:
        # Stored as naive UTC, like every other timestamp in the API. A value
        # without a zone is taken as UTC.
        if moment is None:
            return None
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
