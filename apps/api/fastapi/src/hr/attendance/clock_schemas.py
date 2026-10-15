import uuid
from typing import Literal

from pydantic import Field

from src.models import BaseModel, UtcDateTime

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


class ClockResult(BaseModel):
    action: Literal["ARRIVED", "DEPARTED"]
    site_name: str
    attendance: AttendanceShiftPublic
    # Whole minutes versus the rostered shift; 0 when on time. Not stored and not
    # used for pay, overtime policy or discipline.
    late_minutes: int = 0
    early_departure_minutes: int = 0
    overtime_minutes: int = 0
