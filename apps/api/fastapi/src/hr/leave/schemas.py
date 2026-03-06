import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from src.hr.models import RequestStatus
from src.models import BaseModel

from .models import LeaveType


class LeaveRequestCreate(BaseModel):
    department_id: str
    leave_type: LeaveType
    start_date: date
    end_date: date
    days_requested: Decimal = Field(default=Decimal("0.0"))
    days_with_pay: Decimal = Field(default=Decimal("0.0"))
    days_without_pay: Decimal = Field(default=Decimal("0.0"))
    reason: str | None = None
    contact_phone: str | None = None
    leave_address: str | None = None
    acting_officer_id: uuid.UUID | None = None


class LeaveRequestAction(BaseModel):
    status: RequestStatus
    comments: str | None = Field(default=None, max_length=1000)
    head_of_dept_comments: str | None = None


class LeaveRequestPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    department_id: str
    leave_type: LeaveType
    start_date: date
    end_date: date
    days_requested: Decimal
    days_with_pay: Decimal
    days_without_pay: Decimal
    reason: str | None = None
    contact_phone: str | None = None
    leave_address: str | None = None
    acting_officer_id: uuid.UUID | None = None
    head_of_dept_comments: str | None = None
    status: RequestStatus
    workflow_instance_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class LeaveRequestListPublic(BaseModel):
    data: list[LeaveRequestPublic]
    count: int
