import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum
from typing import ClassVar

import sqlalchemy as sa
from sqlalchemy import ForeignKey, Index, Numeric, String, UniqueConstraint, text
from sqlalchemy.orm import Mapped, mapped_column

from src.hr.models import RequestStatus
from src.orm import Base
from src.utils.datetime import utc_now


class LeaveType(str, Enum):
    VACATION = "VACATION"
    SICK = "SICK"
    CASUAL = "CASUAL"
    MATERNITY = "MATERNITY"
    PATERNITY = "PATERNITY"
    STUDY = "STUDY"
    COMPASSIONATE = "COMPASSIONATE"
    PROFESSIONAL_APPOINTMENT = "PROFESSIONAL_APPOINTMENT"
    BEREAVEMENT = "BEREAVEMENT"
    WITHOUT_PAY = "WITHOUT_PAY"
    OTHER = "OTHER"


class LeaveEntryKind(str, Enum):
    """Why a ledger entry exists. Posted only through ``hr.leave.ledger``."""

    OPENING = "OPENING"
    ADJUSTMENT = "ADJUSTMENT"
    APPROVAL_DEBIT = "APPROVAL_DEBIT"


class ProfAppointmentType(str, Enum):
    BANK = "BANK"
    MEDICAL = "MEDICAL"
    LEGAL = "LEGAL"
    DENTAL = "DENTAL"


class LeaveRequest(Base):
    __tablename__ = "leave_request"
    __table_args__ = {"schema": "hr"}

    # Accepted for legacy ORM construction; signatures are stored separately.
    signature_version: ClassVar[uuid.UUID | None] = None

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    department_id: Mapped[str] = mapped_column(
        ForeignKey("hr.department.id"), index=True
    )
    leave_type: Mapped[LeaveType]
    start_date: Mapped[date]
    end_date: Mapped[date]
    days_requested: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0.0")
    )
    days_with_pay: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0.0")
    )
    days_without_pay: Mapped[Decimal] = mapped_column(
        Numeric(6, 2), default=Decimal("0.0")
    )
    professional_appointment_subtype: Mapped[ProfAppointmentType | None]
    reason: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    contact_phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    leave_address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    travel_from_date: Mapped[date | None]
    travel_to_date: Mapped[date | None]
    salary_in_advance: Mapped[bool] = mapped_column(default=False)
    requires_acting_appointment: Mapped[bool] = mapped_column(default=False)
    acting_officer_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    expected_return_date: Mapped[date | None]
    head_of_dept_comments: Mapped[str | None] = mapped_column(
        String(1000), nullable=True
    )
    status: Mapped[RequestStatus] = mapped_column(default=RequestStatus.SUBMITTED)
    workflow_instance_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.workflow_instance.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class LeaveBalanceEvent(Base):
    """Append-only leave ledger; ``sequence`` orders entries per user and type."""

    __tablename__ = "leave_balance_event"
    __table_args__ = (
        UniqueConstraint(
            "user_id",
            "leave_type",
            "sequence",
            name="uq_hr_leave_balance_event_user_type_sequence",
        ),
        Index(
            "uq_hr_leave_balance_event_approval_debit",
            "related_leave_request_id",
            unique=True,
            postgresql_where=text("entry_kind = 'APPROVAL_DEBIT'"),
        ),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    leave_type: Mapped[str] = mapped_column(String(30))
    entry_kind: Mapped[LeaveEntryKind] = mapped_column(
        sa.Enum(LeaveEntryKind, native_enum=False, length=20)
    )
    sequence: Mapped[int]
    delta_days: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    balance_after_days: Mapped[Decimal] = mapped_column(Numeric(6, 2))
    reason: Mapped[str] = mapped_column(String(200))
    related_leave_request_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("hr.leave_request.id"), nullable=True
    )
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
