"""Actual attendance, kept separate from the published schedule and payroll."""

import uuid
from datetime import datetime

from sqlalchemy import ForeignKey, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class AttendanceRecord(Base):
    __tablename__ = "attendance_record"
    __table_args__ = (
        UniqueConstraint("roster_assignment_id", name="uq_hr_attendance_assignment"),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    roster_assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.roster_assignment.id"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    department_id: Mapped[str] = mapped_column(ForeignKey("hr.department.id"))
    arrived_at: Mapped[datetime]
    departed_at: Mapped[datetime | None]
    break_minutes: Mapped[int] = mapped_column(default=0)
    notes: Mapped[str | None] = mapped_column(String(500))
    revision: Mapped[int] = mapped_column(default=1)
    workflow_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.workflow_instance.id")
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class AttendanceCorrection(Base):
    __tablename__ = "attendance_correction"
    __table_args__ = {"schema": "hr"}
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    attendance_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.attendance_record.id"), index=True
    )
    proposed_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    expected_revision: Mapped[int]
    arrived_at: Mapped[datetime]
    departed_at: Mapped[datetime]
    break_minutes: Mapped[int]
    reason: Mapped[str] = mapped_column(String(500))
    workflow_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.workflow_instance.id")
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
