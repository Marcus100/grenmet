import uuid
from datetime import date, datetime

from pydantic import Field

from src.hr.models import RequestStatus
from src.models import BaseModel

from .models import PersonnelStatus, ShiftPeriod


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
    shift_period: ShiftPeriod | None = None
    all_personnel_reported_on_time: bool | None = None
    personnel_explanation: str | None = None
    affected_operations: bool | None = None
    affected_operations_explanation: str | None = None
    all_equipment_operational: bool | None = None
    equipment_issue_reason: str | None = None
    equipment_remedy_action: str | None = None
    incident_reports_submitted: bool | None = None
    incident_explanation: str | None = None
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
    shift_period: ShiftPeriod | None = None
    submitted_by_user_id: uuid.UUID
    all_personnel_reported_on_time: bool | None = None
    personnel_explanation: str | None = None
    affected_operations: bool | None = None
    affected_operations_explanation: str | None = None
    all_equipment_operational: bool | None = None
    equipment_issue_reason: str | None = None
    equipment_remedy_action: str | None = None
    incident_reports_submitted: bool | None = None
    incident_explanation: str | None = None
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
