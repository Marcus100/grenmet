import uuid
from datetime import date, datetime
from enum import Enum

from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.hr.models import RequestStatus
from src.orm import Base
from src.utils.datetime import utc_now


class AbsenceReason(str, Enum):
    UNCERTIFIED_SICK = "UNCERTIFIED_SICK"
    ILLNESS_FAMILY_MEMBER = "ILLNESS_FAMILY_MEMBER"
    ILLNESS_ON_JOB = "ILLNESS_ON_JOB"
    TIME_OFF = "TIME_OFF"
    OTHER = "OTHER"


ABSENCE_REASONS_REQUIRING_NOTES = {
    AbsenceReason.UNCERTIFIED_SICK,
    AbsenceReason.ILLNESS_ON_JOB,
}


class AbsenteeReport(Base):
    __tablename__ = "absentee_report"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    report_date: Mapped[date]
    expected_shift_code: Mapped[str | None] = mapped_column(String(10), nullable=True)
    absence_start_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    absence_end_time: Mapped[str | None] = mapped_column(String(5), nullable=True)
    reason: Mapped[AbsenceReason] = mapped_column(default=AbsenceReason.OTHER)
    notes: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    contact_attempted: Mapped[bool] = mapped_column(default=False)
    contact_method: Mapped[str | None] = mapped_column(String(50), nullable=True)
    replacement_arranged: Mapped[bool] = mapped_column(default=False)
    replacement_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    status: Mapped[RequestStatus] = mapped_column(default=RequestStatus.SUBMITTED)
    workflow_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.workflow_instance.id"), nullable=True
    )
    submitted_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)
