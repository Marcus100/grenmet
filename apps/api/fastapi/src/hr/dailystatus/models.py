import uuid
from datetime import date, datetime
from enum import Enum

from sqlmodel import Field, SQLModel

from src.hr.models import RequestStatus
from src.utils.datetime import utc_now


class PersonnelStatus(str, Enum):
    PRESENT = "PRESENT"
    ABSENT = "ABSENT"
    LATE = "LATE"
    ON_LEAVE = "ON_LEAVE"
    EXCUSED = "EXCUSED"


class ShiftPeriod(str, Enum):
    AM = "AM"
    PM = "PM"


class StatusReport(SQLModel, table=True):
    __tablename__ = "status_report"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    report_date: date
    shift_code: str = Field(max_length=10)
    shift_period: ShiftPeriod | None = Field(default=None)
    submitted_by_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    # Structured Yes/No + explain pairs mirroring the paper form.
    all_personnel_reported_on_time: bool | None = Field(default=None)
    personnel_explanation: str | None = Field(default=None, max_length=1000)
    affected_operations: bool | None = Field(default=None)
    affected_operations_explanation: str | None = Field(default=None, max_length=1000)
    all_equipment_operational: bool | None = Field(default=None)
    equipment_issue_reason: str | None = Field(default=None, max_length=1000)
    equipment_remedy_action: str | None = Field(default=None, max_length=1000)
    incident_reports_submitted: bool | None = Field(default=None)
    incident_explanation: str | None = Field(default=None, max_length=1000)
    weather_summary: str | None = Field(default=None, max_length=1000)
    equipment_summary: str | None = Field(default=None, max_length=1000)
    personnel_summary: str | None = Field(default=None, max_length=1000)
    runway_status: str | None = Field(default=None, max_length=1000)
    navaids_status: str | None = Field(default=None, max_length=1000)
    communications_status: str | None = Field(default=None, max_length=1000)
    general_remarks: str | None = Field(default=None, max_length=2000)
    status: RequestStatus = Field(default=RequestStatus.SUBMITTED)
    workflow_instance_id: uuid.UUID | None = Field(
        default=None, foreign_key="hr.workflow_instance.id"
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class StatusReportEntry(SQLModel, table=True):
    __tablename__ = "status_report_entry"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    status_report_id: uuid.UUID = Field(foreign_key="hr.status_report.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    personnel_status: PersonnelStatus
    arrival_time: str | None = Field(default=None, max_length=5)
    departure_time: str | None = Field(default=None, max_length=5)
    notes: str | None = Field(default=None, max_length=500)
