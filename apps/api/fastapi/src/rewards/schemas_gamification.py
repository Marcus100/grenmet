"""Schemas for venues, trails, check-ins, achievements and organisation ledger views (PF9, PF11)."""

import re
import uuid
from datetime import date
from typing import Annotated, Any

from pydantic import Field, field_validator, model_validator

from src.models import BaseModel, UtcDateTime

from .models import EntryKind, EntryStatus
from .models_gamification import AchievementRule, TrailKind, TrailStatus

Name = Annotated[str, Field(min_length=1, max_length=120)]
Text = Annotated[str, Field(max_length=500)]
_KEY = re.compile(r"^[a-z0-9]+(-[a-z0-9]+)*$")


class RewardsVenueCreate(BaseModel):
    name: Name


class RewardsVenuePublic(BaseModel):
    """A venue. The signing secret is never returned."""

    id: uuid.UUID
    name: str
    active: bool
    created_at: UtcDateTime


class RewardsQrTokenPublic(BaseModel):
    """The current code for the venue's display screen; refetch before it expires."""

    token: str
    window_seconds: int
    refresh_after_seconds: int


class RewardsTrailStopCreate(BaseModel):
    label: Name
    venue_id: uuid.UUID | None = None
    required_check_in: bool = True

    @model_validator(mode="after")
    def _required_needs_venue(self) -> RewardsTrailStopCreate:
        if self.required_check_in and self.venue_id is None:
            raise ValueError("A required stop needs a venue")
        return self


class RewardsTrailStopPublic(BaseModel):
    id: uuid.UUID
    position: int
    label: str
    venue_id: uuid.UUID | None
    required_check_in: bool


class RewardsTrailCreate(BaseModel):
    name: Name
    description: Text = ""
    kind: TrailKind = TrailKind.CUSTOM
    starts_on: date | None = None
    ends_on: date | None = None
    status: TrailStatus = TrailStatus.ACTIVE
    stops: Annotated[list[RewardsTrailStopCreate], Field(max_length=50)] = []

    @model_validator(mode="after")
    def _window(self) -> RewardsTrailCreate:
        if self.starts_on and self.ends_on and self.starts_on > self.ends_on:
            raise ValueError("starts_on must not be after ends_on")
        return self


class RewardsTrailUpdate(BaseModel):
    name: Name | None = None
    description: Text | None = None
    status: TrailStatus | None = None
    starts_on: date | None = None
    ends_on: date | None = None


class RewardsTrailPublic(BaseModel):
    id: uuid.UUID
    organisation_id: str | None
    name: str
    description: str
    kind: TrailKind
    starts_on: date | None
    ends_on: date | None
    status: TrailStatus
    stops: list[RewardsTrailStopPublic]


class RewardsAchievementCreate(BaseModel):
    key: Annotated[str, Field(min_length=2, max_length=60)]
    name: Name
    description: Text = ""
    rule_type: AchievementRule
    #: attended_n_events {"n": int}; visited_all_stops_of_trail {"trail_id": uuid};
    #: streak_days {"days": int}.
    parameters: dict[str, Any] = {}

    @field_validator("key")
    @classmethod
    def _key_format(cls, value: str) -> str:
        if not _KEY.match(value):
            raise ValueError("key must be lowercase words joined by hyphens")
        return value


class RewardsAchievementDefinitionPublic(BaseModel):
    id: uuid.UUID
    organisation_id: str | None
    key: str
    name: str
    description: str
    rule_type: AchievementRule
    parameters: dict[str, Any]
    active: bool


class RewardsAchievementPublic(BaseModel):
    """An achievement as the account sees it; derived from records."""

    key: str
    name: str
    description: str
    earned: bool
    awarded_at: UtcDateTime | None


class CheckInCreate(BaseModel):
    #: The rotating code shown at the venue.
    token: Annotated[str, Field(min_length=10, max_length=200)]


class CheckInPublic(BaseModel):
    id: uuid.UUID
    venue_name: str
    local_date: date
    stamps_credited: int
    achievements: list[RewardsAchievementPublic]


class PassportStopPublic(BaseModel):
    id: uuid.UUID
    position: int
    label: str
    required_check_in: bool
    stamped_at: UtcDateTime | None


class PassportTrailPublic(BaseModel):
    id: uuid.UUID
    name: str
    description: str
    kind: TrailKind
    organisation_id: str | None
    starts_on: date | None
    ends_on: date | None
    stops: list[PassportStopPublic]
    stamped: int
    required: int
    completed: bool


class StreakPublic(BaseModel):
    """Consecutive Grenada calendar days with a venue check-in."""

    current_days: int
    longest_days: int
    last_check_in: date | None
    checked_in_today: bool


class RewardsOrgEntryPublic(BaseModel):
    """A ledger entry as the funding organisation sees it: no account identity."""

    id: uuid.UUID
    program_id: uuid.UUID
    program_name: str
    kind: EntryKind
    amount: int
    status: EntryStatus
    source_type: str | None
    reason: str | None
    created_at: UtcDateTime
    settled_at: UtcDateTime | None


class RewardsOrgEntryListPublic(BaseModel):
    data: list[RewardsOrgEntryPublic]
    count: int
    page: int
    size: int
