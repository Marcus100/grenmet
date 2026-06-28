import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlmodel import Field, SQLModel

from src.hr.models import RequestStatus  # noqa: F401
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


class ProfAppointmentType(str, Enum):
    BANK = "BANK"
    MEDICAL = "MEDICAL"
    LEGAL = "LEGAL"
    DENTAL = "DENTAL"


class LeaveRequest(SQLModel, table=True):
    __tablename__ = "leave_request"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    leave_type: LeaveType
    start_date: date
    end_date: date
    days_requested: Decimal = Field(
        default=Decimal("0.0"), decimal_places=2, max_digits=6
    )
    days_with_pay: Decimal = Field(
        default=Decimal("0.0"), decimal_places=2, max_digits=6
    )
    days_without_pay: Decimal = Field(
        default=Decimal("0.0"), decimal_places=2, max_digits=6
    )
    professional_appointment_subtype: ProfAppointmentType | None = Field(default=None)
    reason: str | None = Field(default=None, max_length=1000)
    contact_phone: str | None = Field(default=None, max_length=30)
    leave_address: str | None = Field(default=None, max_length=500)
    travel_from_date: date | None = Field(default=None)
    travel_to_date: date | None = Field(default=None)
    salary_in_advance: bool = Field(default=False)
    requires_acting_appointment: bool = Field(default=False)
    acting_officer_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    expected_return_date: date | None = Field(default=None)
    head_of_dept_comments: str | None = Field(default=None, max_length=1000)
    status: RequestStatus = Field(default=RequestStatus.SUBMITTED)
    workflow_instance_id: uuid.UUID | None = Field(
        default=None, foreign_key="hr.workflow_instance.id"
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class LeaveBalanceEvent(SQLModel, table=True):
    __tablename__ = "leave_balance_event"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    leave_type: str = Field(max_length=30)
    delta_days: Decimal = Field(decimal_places=2, max_digits=6)
    balance_after_days: Decimal = Field(decimal_places=2, max_digits=6)
    reason: str = Field(max_length=200)
    related_leave_request_id: uuid.UUID | None = Field(
        default=None, foreign_key="hr.leave_request.id"
    )
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utc_now)
