import uuid
from datetime import date, datetime

from pydantic import Field

from src.hr.models import RequestStatus
from src.models import BaseModel

from .models import PersonnelStatus


class StatusReportEntryInput(BaseModel):
    user_id: uuid.UUID
    personnel_status: PersonnelStatus
    arrival_time: str | None = None
    departure_time: str | None = None
    notes: str | None = None


class StatusReportCreate(BaseModel):
    department_id: str
    report_date: date
    shift_code: str
    weather_summary: str | None = None
    equipment_summary: str | None = None
    personnel_summary: str | None = None
    runway_status: str | None = None
    navaids_status: str | None = None
    communications_status: str | None = None
    general_remarks: str | None = None
    entries: list[StatusReportEntryInput] = Field(default_factory=list)


class StatusReportEntryPublic(BaseModel):
    id: uuid.UUID
    status_report_id: uuid.UUID
    user_id: uuid.UUID
    personnel_status: PersonnelStatus
    arrival_time: str | None = None
    departure_time: str | None = None
    notes: str | None = None


class StatusReportPublic(BaseModel):
    id: uuid.UUID
    department_id: str
    report_date: date
    shift_code: str
    submitted_by_user_id: uuid.UUID
    weather_summary: str | None = None
    equipment_summary: str | None = None
    personnel_summary: str | None = None
    runway_status: str | None = None
    navaids_status: str | None = None
    communications_status: str | None = None
    general_remarks: str | None = None
    status: RequestStatus
    workflow_instance_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class StatusReportDetails(BaseModel):
    report: StatusReportPublic
    entries: list[StatusReportEntryPublic]


class StatusReportListPublic(BaseModel):
    data: list[StatusReportPublic]
    count: int
