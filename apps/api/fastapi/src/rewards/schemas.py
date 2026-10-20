import uuid
from enum import Enum
from typing import Annotated

from pydantic import Field, field_validator

from src.models import BaseModel, UtcDateTime

from .models import EntryKind, EntryStatus, FlagReason, ProgramKind, ProgramStatus
from .sources import EVENTS_ADMISSION, is_qualifying_source

Name = Annotated[str, Field(min_length=1, max_length=120)]
Description = Annotated[str, Field(min_length=1, max_length=500)]
Reason = Annotated[str, Field(min_length=3, max_length=500)]


class ProgramCreate(BaseModel):
    name: Name
    stamps_required: Annotated[int, Field(ge=1, le=100)]
    reward_description: Description
    stamps_per_source: Annotated[int, Field(ge=1, le=10)] = 1
    max_redemptions_per_account: Annotated[int, Field(ge=1, le=1000)] | None = None
    #: What earns a stamp; one of the catalogue in ``sources.py``.
    qualifying_source_type: str = EVENTS_ADMISSION

    @field_validator("qualifying_source_type")
    @classmethod
    def _known_source(cls, value: str) -> str:
        if not is_qualifying_source(value):
            raise ValueError("Unknown qualifying source type")
        return value


class ProgramUpdate(BaseModel):
    name: Name | None = None
    reward_description: Description | None = None
    status: ProgramStatus | None = None
    max_redemptions_per_account: Annotated[int, Field(ge=1, le=1000)] | None = None


class ProgramPublic(BaseModel):
    id: uuid.UUID
    organisation_id: str
    name: str
    kind: ProgramKind
    stamps_required: int
    reward_description: str
    qualifying_source_type: str
    stamps_per_source: int
    max_redemptions_per_account: int | None
    status: ProgramStatus
    created_at: UtcDateTime


class ProgramAdminPublic(ProgramPublic):
    organisation_name: str


class ProgramAdminListPublic(BaseModel):
    data: list[ProgramAdminPublic]
    count: int
    page: int
    size: int


class RewardCardPublic(BaseModel):
    """One stamp card as the account holder sees it."""

    program_id: uuid.UUID
    program_name: str
    organisation_id: str
    organisation_name: str
    reward_description: str
    stamps_required: int
    #: Settled stamps (confirmed, including reversed pairs that net to zero).
    balance: int
    #: Stamps earned but not confirmed yet; not spendable.
    pending: int
    #: What can be redeemed now: balance minus stamps held by an open redemption.
    available: int
    redemptions: int
    open_redemption_code: str | None
    can_redeem: bool


class RewardEntryPublic(BaseModel):
    id: uuid.UUID
    program_id: uuid.UUID
    program_name: str
    organisation_name: str
    kind: EntryKind
    amount: int
    status: EntryStatus
    reason: str | None
    redeem_code: str | None
    created_at: UtcDateTime


class RewardEntryListPublic(BaseModel):
    data: list[RewardEntryPublic]
    count: int
    page: int
    size: int


class RedemptionRequest(BaseModel):
    program_id: uuid.UUID


class RedemptionPublic(BaseModel):
    id: uuid.UUID
    program_id: uuid.UUID
    program_name: str
    reward_description: str
    stamps: int
    status: EntryStatus
    code: str | None
    created_at: UtcDateTime


class RedemptionConfirm(BaseModel):
    code: Annotated[str, Field(min_length=4, max_length=12)]


class RedemptionConfirmed(BaseModel):
    """What staff need to hand over the reward; no personal data."""

    program_name: str
    reward_description: str
    stamps: int
    confirmed_at: UtcDateTime


class AdjustmentCreate(BaseModel):
    account_id: uuid.UUID
    program_id: uuid.UUID
    amount: Annotated[int, Field(ge=-1000, le=1000)]
    reason: Reason


class FlagPublic(BaseModel):
    id: uuid.UUID
    account_id: uuid.UUID
    reason: FlagReason
    detail: str
    created_at: UtcDateTime
    resolved_at: UtcDateTime | None
    resolution_note: str | None


class FlagResolve(BaseModel):
    note: Reason


class BadgeKey(str, Enum):
    VERIFIED_ORGANISER = "verified_organiser"
    VERIFIED_ATTENDEE = "verified_attendee"
    VERIFIED_PURCHASER = "verified_purchaser"


class BadgePublic(BaseModel):
    """A derived trust signal. Computed from records on every read."""

    key: BadgeKey
    label: str
    description: str
    earned: bool
    #: False when the source records cannot be read right now (never an error).
    available: bool
    count: int
    since: UtcDateTime | None
