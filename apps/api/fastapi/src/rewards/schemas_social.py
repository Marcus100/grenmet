"""Schemas for the social layer (PF10): leaderboards, challenges, stamp gifts."""

import uuid
from typing import Annotated

from pydantic import EmailStr, Field, field_validator, model_validator

from src.models import BaseModel, UtcDateTime

from .models_social import ChallengeMetric, ChallengeStatus, ScopeKind

ANONYMOUS_ALIAS = "Anonymous explorer"


class RewardsLeaderboardOptInCreate(BaseModel):
    """Consent to appear on one board. Names stay hidden unless ``show_name``."""

    display_alias: Annotated[str | None, Field(max_length=40)] = None
    show_name: bool = False

    @field_validator("display_alias")
    @classmethod
    def _strip(cls, value: str | None) -> str | None:
        value = (value or "").strip()
        return value or None


class RewardsLeaderboardOptInPublic(BaseModel):
    scope_kind: ScopeKind
    scope_id: str
    display_alias: str | None
    show_name: bool
    opted_in_at: UtcDateTime
    active: bool


class RewardsLeaderboardRow(BaseModel):
    rank: int
    display_name: str
    #: A count of real-world actions, never an amount of money.
    score: int
    is_me: bool


class RewardsLeaderboardPublic(BaseModel):
    scope_kind: ScopeKind
    scope_id: str
    metric: ChallengeMetric
    #: False when the board is withheld (small-cohort guard).
    available: bool
    reason: str | None = None
    min_cohort: int
    rows: list[RewardsLeaderboardRow]
    my_rank: int | None = None
    my_score: int | None = None


class RewardsChallengeCreate(BaseModel):
    name: Annotated[str, Field(min_length=1, max_length=120)]
    description: Annotated[str, Field(max_length=500)] = ""
    metric: ChallengeMetric
    target_total: Annotated[int, Field(gt=0, le=1_000_000)]
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    #: Non-monetary text (a thank-you, a shout-out). It creates no ledger value.
    reward_description: Annotated[str, Field(max_length=500)] = ""

    @model_validator(mode="after")
    def _window(self) -> RewardsChallengeCreate:
        if self.starts_at >= self.ends_at:
            raise ValueError("starts_at must be before ends_at")
        return self


class RewardsChallengePublic(BaseModel):
    """A community challenge with its collective progress. No individual identities."""

    id: uuid.UUID
    organisation_id: str | None
    name: str
    description: str
    metric: ChallengeMetric
    target_total: int
    starts_at: UtcDateTime
    ends_at: UtcDateTime
    reward_description: str
    status: ChallengeStatus
    total: int
    completed: bool
    completed_at: UtcDateTime | None = None


class RewardsGiftCreate(BaseModel):
    """Gift a souvenir copy of a stamp you earned at a venue to another account."""

    recipient_email: EmailStr
    venue_id: uuid.UUID


class RewardsGiftPublic(BaseModel):
    id: uuid.UUID
    kind: str
    venue_name: str
    #: First name and last initial of the other person.
    counterpart_name: str
    created_at: UtcDateTime
    reversed_at: UtcDateTime | None = None
    reversible_until: UtcDateTime | None = None
