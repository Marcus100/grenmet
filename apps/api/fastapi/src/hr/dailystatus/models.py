import uuid
from datetime import date, datetime
from enum import Enum

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.hr.models import RequestStatus
from src.orm import Base
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


class StatusReport(Base):
    __tablename__ = "status_report"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    report_date: Mapped[date]
    shift_code: Mapped[str] = mapped_column(String(10))
    shift_period: Mapped[ShiftPeriod | None]
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id"), index=True
    )
    all_personnel_reported_on_time: Mapped[bool | None]
    personnel_explanation: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )
    affected_operations: Mapped[bool | None]
    affected_operations_explanation: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )
    all_equipment_operational: Mapped[bool | None]
    equipment_issue_reason: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )
    equipment_remedy_action: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )
    incident_reports_submitted: Mapped[bool | None]
    incident_explanation: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )
    weather_summary: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    equipment_summary: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    personnel_summary: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    runway_status: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    navaids_status: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    communications_status: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )
    general_remarks: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    status: Mapped[RequestStatus] = mapped_column(default=RequestStatus.SUBMITTED)
    workflow_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.workflow_instance.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class StatusReportEntry(Base):
    __tablename__ = "status_report_entry"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    status_report_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.status_report.id"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    personnel_status: Mapped[PersonnelStatus]
    arrival_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    departure_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    notes: Mapped[str | None] = mapped_column(String(500), nullable=True)
