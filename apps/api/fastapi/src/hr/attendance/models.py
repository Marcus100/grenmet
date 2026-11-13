"""Actual attendance, kept separate from the published schedule and payroll."""

import uuid
from datetime import datetime
from enum import Enum

from sqlalchemy import ForeignKey, Index, String, UniqueConstraint, text
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


class ClockSite(Base):
    """A place staff clock in at, proved by a static token on an NFC tag or QR code.

    Only the SHA-256 hash is stored; the token is shown once when created or
    rotated. A static token accepts the risk of a photographed tag (ADR-0009).
    """

    __tablename__ = "clock_site"
    __table_args__ = {"schema": "hr"}

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    name: Mapped[str] = mapped_column(String(120))
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    is_active: Mapped[bool] = mapped_column(default=True)
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class ClockPunchKind(str, Enum):
    ARRIVE = "ARRIVE"
    DEPART = "DEPART"


class ClockPunchStatus(str, Enum):
    PENDING = "PENDING"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"


class ClockPunch(Base):
    """A phone clock-in awaiting supervisor approval (ADR-0040).

    A phone punch is not attendance until a supervisor approves it: approval is
    what writes (or closes) the ``AttendanceRecord``, so hours and timesheets
    never see a pending or rejected punch. Terminal punches will not use this
    table; they count immediately.
    """

    __tablename__ = "clock_punch"
    __table_args__ = (
        Index("ix_hr_clock_punch_status_department", "status", "department_id"),
        Index(
            "uq_hr_clock_punch_live_kind",
            "roster_assignment_id",
            "kind",
            unique=True,
            postgresql_where=text("status <> 'REJECTED'"),
        ),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    department_id: Mapped[str] = mapped_column(ForeignKey("hr.department.id"))
    clock_site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("hr.clock_site.id"))
    roster_assignment_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("hr.roster_assignment.id"), index=True
    )
    kind: Mapped[str] = mapped_column(String(16))
    punched_at: Mapped[datetime]
    status: Mapped[str] = mapped_column(
        String(16), default=ClockPunchStatus.PENDING.value
    )
    reviewed_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user.id"))
    reviewed_at: Mapped[datetime | None]
    review_note: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class TerminalPunchOutcome(str, Enum):
    """What the import decided for one terminal punch (ADR-0040).

    PENDING is transient: a row is written first and decided straight after, so it
    survives only if an import stopped part way. ``ALREADY_RECORDED`` means the shift
    already has this arrival or departure (for example from an approved phone punch
    close in time), so no second record is written.
    """

    PENDING = "PENDING"
    UNMAPPED = "UNMAPPED"
    REPEAT = "REPEAT"
    RECORDED = "RECORDED"
    ALREADY_RECORDED = "ALREADY_RECORDED"
    NO_SHIFT = "NO_SHIFT"
    REFUSED = "REFUSED"


class TerminalAttentionOutcome(str, Enum):
    """Outcomes HR must look at: held or refused, never silently dropped."""

    UNMAPPED = "UNMAPPED"
    NO_SHIFT = "NO_SHIFT"
    REFUSED = "REFUSED"


class TerminalUser(Base):
    """Maps a fingerprint or fob terminal's user ID to one employee (ADR-0040).

    Only the device's user ID is stored, never biometric data. One device ID per
    person and one person per device ID within a department.
    """

    __tablename__ = "terminal_user"
    __table_args__ = (
        UniqueConstraint(
            "department_id", "device_user_id", name="uq_hr_terminal_user_device"
        ),
        UniqueConstraint("department_id", "user_id", name="uq_hr_terminal_user_person"),
        Index("ix_hr_terminal_user_user_id", "user_id"),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[str] = mapped_column(ForeignKey("hr.department.id"))
    device_user_id: Mapped[str] = mapped_column(String(32))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class TerminalPunch(Base):
    """One punch from a terminal export, kept whatever happens to it (ADR-0040).

    The unique key makes a re-run of the same export import nothing twice. Rows
    that count point at the attendance they wrote through ``roster_assignment_id``;
    held rows (UNMAPPED, NO_SHIFT, REFUSED) wait for HR.
    """

    __tablename__ = "terminal_punch"
    __table_args__ = (
        UniqueConstraint(
            "department_id",
            "terminal",
            "device_user_id",
            "punched_at",
            name="uq_hr_terminal_punch_scan",
        ),
        Index("ix_hr_terminal_punch_department_outcome", "department_id", "outcome"),
        Index("ix_hr_terminal_punch_import_id", "import_id"),
        Index("ix_hr_terminal_punch_user_id", "user_id"),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[str] = mapped_column(ForeignKey("hr.department.id"))
    terminal: Mapped[str] = mapped_column(String(60))
    device_user_id: Mapped[str] = mapped_column(String(32))
    punched_at: Mapped[datetime]
    user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("user.id"))
    roster_assignment_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.roster_assignment.id")
    )
    kind: Mapped[str | None] = mapped_column(String(16))
    outcome: Mapped[str] = mapped_column(String(24))
    detail: Mapped[str | None] = mapped_column(String(255))
    import_id: Mapped[uuid.UUID]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
