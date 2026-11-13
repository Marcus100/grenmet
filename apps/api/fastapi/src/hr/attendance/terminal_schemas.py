"""API shapes for the terminal punch import (ADR-0040). Never the ORM models."""

import uuid
from collections import Counter

from pydantic import Field

from src.models import BaseModel, UtcDateTime

from .models import ClockPunchKind, TerminalPunchOutcome

DEVICE_USER_ID_PATTERN = r"^\S{1,32}$"


class TerminalUserCreate(BaseModel):
    department_id: str = Field(min_length=1, max_length=64)
    device_user_id: str = Field(pattern=DEVICE_USER_ID_PATTERN)
    user_id: uuid.UUID


class TerminalUserPublic(BaseModel):
    id: uuid.UUID
    department_id: str
    device_user_id: str
    user_id: uuid.UUID
    employee_name: str
    created_at: UtcDateTime


class TerminalUsersPublic(BaseModel):
    data: list[TerminalUserPublic]
    count: int


class TerminalPunchPublic(BaseModel):
    id: uuid.UUID
    department_id: str
    terminal: str
    device_user_id: str
    punched_at: UtcDateTime
    user_id: uuid.UUID | None = None
    employee_name: str | None = None
    roster_assignment_id: uuid.UUID | None = None
    kind: ClockPunchKind | None = None
    outcome: TerminalPunchOutcome
    detail: str | None = None
    import_id: uuid.UUID


class TerminalPunchesPublic(BaseModel):
    data: list[TerminalPunchPublic]
    count: int


class TerminalImportErrorPublic(BaseModel):
    line: int
    message: str


class TerminalOutcomeCounts(BaseModel):
    """How many punches ended in each outcome. Zero when none did."""

    recorded: int = 0
    already_recorded: int = 0
    repeat: int = 0
    no_shift: int = 0
    unmapped: int = 0
    refused: int = 0


class TerminalImportPublic(BaseModel):
    import_id: uuid.UUID
    department_id: str
    terminal: str
    #: Punches stored by this upload.
    new_punches: int
    #: Lines already imported (or repeated inside the file): nothing was done.
    duplicates: int
    errors: list[TerminalImportErrorPublic]
    #: Outcomes of this upload's new punches only.
    outcomes: TerminalOutcomeCounts
    #: Attention rows (UNMAPPED, NO_SHIFT, REFUSED) of this upload only.
    rows: list[TerminalPunchPublic]


class TerminalReprocessRequest(BaseModel):
    department_id: str = Field(min_length=1, max_length=64)


class TerminalReprocessPublic(BaseModel):
    #: Punches decided by this call.
    processed: int
    outcomes: TerminalOutcomeCounts
    #: Candidates beyond this call's cap (at most 1000 per call); call again while > 0.
    remaining: int


def outcome_counts(counts: Counter[TerminalPunchOutcome]) -> TerminalOutcomeCounts:
    return TerminalOutcomeCounts(
        recorded=counts[TerminalPunchOutcome.RECORDED],
        already_recorded=counts[TerminalPunchOutcome.ALREADY_RECORDED],
        repeat=counts[TerminalPunchOutcome.REPEAT],
        no_shift=counts[TerminalPunchOutcome.NO_SHIFT],
        unmapped=counts[TerminalPunchOutcome.UNMAPPED],
        refused=counts[TerminalPunchOutcome.REFUSED],
    )
