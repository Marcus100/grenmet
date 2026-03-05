import uuid
from datetime import date, datetime
from decimal import Decimal
from enum import Enum

from sqlmodel import Field, SQLModel


class RequestStatus(str, Enum):
    DRAFT = "DRAFT"
    SUBMITTED = "SUBMITTED"
    APPROVED = "APPROVED"
    REJECTED = "REJECTED"
    CANCELLED = "CANCELLED"


class LeaveRequest(SQLModel, table=True):
    __tablename__ = "leave_request"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    leave_type: str = Field(max_length=30)
    start_date: date
    end_date: date
    days_requested: Decimal = Field(default=Decimal("0.0"), decimal_places=2, max_digits=6)
    reason: str | None = Field(default=None, max_length=1000)
    status: RequestStatus = Field(default=RequestStatus.SUBMITTED)
    workflow_instance_id: uuid.UUID | None = Field(default=None, foreign_key="hr.workflow_instance.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class LeaveBalanceEvent(SQLModel, table=True):
    __tablename__ = "leave_balance_event"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    leave_type: str = Field(max_length=30)
    delta_days: Decimal = Field(decimal_places=2, max_digits=6)
    balance_after_days: Decimal = Field(decimal_places=2, max_digits=6)
    reason: str = Field(max_length=200)
    related_leave_request_id: uuid.UUID | None = Field(default=None, foreign_key="hr.leave_request.id")
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)


class ShiftSwapRequest(SQLModel, table=True):
    __tablename__ = "shift_swap_request"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    requesting_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    counterpart_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    source_date: date
    source_shift_code: str = Field(max_length=10)
    target_date: date
    target_shift_code: str = Field(max_length=10)
    reason: str | None = Field(default=None, max_length=1000)
    status: RequestStatus = Field(default=RequestStatus.SUBMITTED)
    workflow_instance_id: uuid.UUID | None = Field(default=None, foreign_key="hr.workflow_instance.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class AbsenteeReport(SQLModel, table=True):
    __tablename__ = "absentee_report"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    report_date: date
    reason_code: str = Field(max_length=60)
    notes: str | None = Field(default=None, max_length=1000)
    status: RequestStatus = Field(default=RequestStatus.SUBMITTED)
    workflow_instance_id: uuid.UUID | None = Field(default=None, foreign_key="hr.workflow_instance.id")
    submitted_by_user_id: uuid.UUID = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)


class StatusReport(SQLModel, table=True):
    __tablename__ = "status_report"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    report_date: date
    shift_code: str = Field(max_length=10)
    submitted_by_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    weather_summary: str | None = Field(default=None, max_length=1000)
    equipment_summary: str | None = Field(default=None, max_length=1000)
    personnel_summary: str | None = Field(default=None, max_length=1000)
    status: RequestStatus = Field(default=RequestStatus.SUBMITTED)
    workflow_instance_id: uuid.UUID | None = Field(default=None, foreign_key="hr.workflow_instance.id")
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)
