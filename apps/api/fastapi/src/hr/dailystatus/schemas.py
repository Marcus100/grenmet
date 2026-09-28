import uuid
from datetime import date

from pydantic import Field

from src.hr.models import RequestStatus
from src.hr.roster.models import RosterAvailability
from src.hr.signatures.schemas import SignatureConsent
from src.hr.submission import SubmittedFormPublic
from src.models import BaseModel, UtcDateTime

from .models import PersonnelStatus, ShiftPeriod


class StatusReportEntryInput(BaseModel):
    user_id: uuid.UUID
    personnel_status: PersonnelStatus
    arrival_time: str | None = Field(
        default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$"
    )
    departure_time: str | None = Field(
        default=None, pattern=r"^(?:[01]\d|2[0-3]):[0-5]\d$"
    )
    notes: str | None = Field(default=None, max_length=500)


class StatusReportCreate(SignatureConsent):
    department_id: str
    report_date: date
    shift_code: str = Field(min_length=1, max_length=10)
    shift_period: ShiftPeriod | None = None
    all_personnel_reported_on_time: bool | None = None
    personnel_explanation: str | None = Field(default=None, max_length=1000)
    affected_operations: bool | None = None
    affected_operations_explanation: str | None = Field(default=None, max_length=1000)
    all_equipment_operational: bool | None = None
    equipment_issue_reason: str | None = Field(default=None, max_length=1000)
    equipment_remedy_action: str | None = Field(default=None, max_length=1000)
    incident_reports_submitted: bool | None = None
    incident_explanation: str | None = Field(default=None, max_length=1000)
    weather_summary: str | None = Field(default=None, max_length=1000)
    equipment_summary: str | None = Field(default=None, max_length=1000)
    personnel_summary: str | None = Field(default=None, max_length=1000)
    runway_status: str | None = Field(default=None, max_length=1000)
    navaids_status: str | None = Field(default=None, max_length=1000)
    communications_status: str | None = Field(default=None, max_length=1000)
    general_remarks: str | None = Field(default=None, max_length=2000)
    entries: list[StatusReportEntryInput] = Field(default_factory=list)
    # Named colleagues who must all approve before the report reaches the
    # supervisor/management tiers. Ignored when as_draft is true.
    co_approver_user_ids: list[uuid.UUID] = Field(default_factory=list)
    # Save without submitting: persist as DRAFT with no approval chain yet.
    as_draft: bool = False


class StatusReportSubmit(SignatureConsent):
    co_approver_user_ids: list[uuid.UUID] = Field(default_factory=list)


class StatusReportEntryPublic(BaseModel):
    employee_name: str | None = None
    id: uuid.UUID
    status_report_id: uuid.UUID
    user_id: uuid.UUID
    personnel_status: PersonnelStatus
    arrival_time: str | None = None
    departure_time: str | None = None
    notes: str | None = None


class StatusReportPublic(SubmittedFormPublic):
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
    created_at: UtcDateTime
    updated_at: UtcDateTime


class StatusReportDetails(BaseModel):
    report: StatusReportPublic
    entries: list[StatusReportEntryPublic]


class StatusReportListPublic(BaseModel):
    data: list[StatusReportPublic]
    count: int
    page: int = 1
    size: int = 100


class StatusStaffingEntry(BaseModel):
    roster_assignment_id: uuid.UUID
    user_id: uuid.UUID
    employee_name: str
    scheduled_shift_code: str
    scheduled_start_time: str | None = None
    scheduled_end_time: str | None = None
    ends_next_day: bool
    availability: RosterAvailability
    personnel_status: PersonnelStatus


class StatusStaffingPublic(BaseModel):
    department_id: str
    report_date: date
    shift_code: str
    entries: list[StatusStaffingEntry]
