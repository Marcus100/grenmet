from datetime import date
from decimal import Decimal

from pydantic import Field

from src.models import BaseModel


class DashboardRequest(BaseModel):
    id: str
    title: str
    status: str
    updated_at: str


class DashboardPerson(BaseModel):
    id: str
    name: str
    department: str
    shift: str


class DashboardApproval(BaseModel):
    id: str
    name: str
    kind: str
    submitted_at: str | None = None


class HrDashboardPublic(BaseModel):
    date: date
    scope: str
    can_approve: bool
    vacation_balance: Decimal | None = None
    next_shift: str | None = None
    open_requests: int
    active_staff: int
    departments: int
    shift_types: int
    requests: list[DashboardRequest] = Field(default_factory=list)
    on_duty: list[DashboardPerson] = Field(default_factory=list)
    away: list[DashboardPerson] = Field(default_factory=list)
    approvals: list[DashboardApproval] = Field(default_factory=list)
