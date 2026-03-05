import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from src.models import BaseModel

from .models import RequestStatus


class LeaveRequestCreate(BaseModel):
    department_id: str
    leave_type: str
    start_date: date
    end_date: date
    days_requested: Decimal = Field(default=Decimal("0.0"))
    reason: str | None = None


class LeaveRequestAction(BaseModel):
    status: RequestStatus
    comments: str | None = Field(default=None, max_length=1000)


class LeaveRequestPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    department_id: str
    leave_type: str
    start_date: date
    end_date: date
    days_requested: Decimal
    reason: str | None = None
    status: RequestStatus
    workflow_instance_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class LeaveRequestListPublic(BaseModel):
    data: list[LeaveRequestPublic]
    count: int


class ShiftSwapRequestCreate(BaseModel):
    counterpart_user_id: uuid.UUID
    department_id: str
    source_date: date
    source_shift_code: str
    target_date: date
    target_shift_code: str
    reason: str | None = None


class ShiftSwapAction(BaseModel):
    status: RequestStatus
    comments: str | None = None


class ShiftSwapRequestPublic(BaseModel):
    id: uuid.UUID
    requesting_user_id: uuid.UUID
    counterpart_user_id: uuid.UUID
    department_id: str
    source_date: date
    source_shift_code: str
    target_date: date
    target_shift_code: str
    reason: str | None = None
    status: RequestStatus
    workflow_instance_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class AbsenteeReportCreate(BaseModel):
    user_id: uuid.UUID
    department_id: str
    report_date: date
    reason_code: str
    notes: str | None = None


class AbsenteeReportPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    department_id: str
    report_date: date
    reason_code: str
    notes: str | None = None
    status: RequestStatus
    workflow_instance_id: uuid.UUID | None = None
    submitted_by_user_id: uuid.UUID
    created_at: datetime
    updated_at: datetime


class AbsenteeReportListPublic(BaseModel):
    data: list[AbsenteeReportPublic]
    count: int


class StatusReportCreate(BaseModel):
    department_id: str
    report_date: date
    shift_code: str
    weather_summary: str | None = None
    equipment_summary: str | None = None
    personnel_summary: str | None = None


class StatusReportPublic(BaseModel):
    id: uuid.UUID
    department_id: str
    report_date: date
    shift_code: str
    submitted_by_user_id: uuid.UUID
    weather_summary: str | None = None
    equipment_summary: str | None = None
    personnel_summary: str | None = None
    status: RequestStatus
    workflow_instance_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class StatusReportListPublic(BaseModel):
    data: list[StatusReportPublic]
    count: int
