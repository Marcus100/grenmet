import uuid
from datetime import date
from typing import Literal

from pydantic import Field, RootModel

from src.models import BaseModel, UtcDateTime

from .models import ClockPunchKind, ClockPunchStatus
from .schemas import AttendanceShiftPublic


class ClockSiteCreate(BaseModel):
    department_id: str
    name: str = Field(min_length=1, max_length=120)


class ClockSitePublic(BaseModel):
    id: uuid.UUID
    department_id: str
    name: str
    is_active: bool
    created_at: UtcDateTime


class ClockSitesPublic(BaseModel):
    data: list[ClockSitePublic]
    count: int


class ClockSiteIssued(ClockSitePublic):
    """Returned only when a site is created or its token rotated."""

    token: str


class ClockSiteActive(BaseModel):
    is_active: bool


class ClockRequest(BaseModel):
    token: str = Field(min_length=8, max_length=200)


class ClockPunchPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    department_id: str
    roster_assignment_id: uuid.UUID
    kind: ClockPunchKind
    punched_at: UtcDateTime
    status: ClockPunchStatus
    reviewed_by_user_id: uuid.UUID | None = None
    reviewed_at: UtcDateTime | None = None
    review_note: str | None = None


class ClockPunchPendingPublic(ClockPunchPublic):
    employee_name: str
    site_name: str
    shift_date: date
    shift_code: str


class ClockPunchesPublic(BaseModel):
    data: list[ClockPunchPendingPublic]
    count: int


class ClockPunchApprove(BaseModel):
    note: str | None = Field(default=None, max_length=500)


class ClockPunchReject(BaseModel):
    reason: str = Field(min_length=1, max_length=500)


class ClockResult(BaseModel):
    action: Literal["ARRIVED", "DEPARTED"]
    site_name: str
    # The punch is PENDING until a supervisor approves it; only then is it
    # attendance. ``attendance`` is a provisional, unsaved view of the shift
    # (attendance_id is null) and counts for nothing until approval.
    attendance: AttendanceShiftPublic
    punch: ClockPunchPublic
    # Whole minutes versus the rostered shift; 0 when on time. Not stored and not
    # used for pay, overtime policy or discipline.
    late_minutes: int = 0
    early_departure_minutes: int = 0
    overtime_minutes: int = 0


class ClockPunchApproveBody(RootModel[ClockPunchApprove | None]):
    """Optional approval note. An absent body and null are both accepted."""
