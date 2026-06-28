import uuid
from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from src.hr.models import RequestStatus
from src.models import BaseModel

from .models import LeaveType, ProfAppointmentType


class LeaveRequestCreate(BaseModel):
    department_id: str
    leave_type: LeaveType
    start_date: date
    end_date: date
    days_requested: Decimal = Field(default=Decimal("0.0"))
    days_with_pay: Decimal = Field(default=Decimal("0.0"))
    days_without_pay: Decimal = Field(default=Decimal("0.0"))
    professional_appointment_subtype: ProfAppointmentType | None = None
    reason: str | None = None
    contact_phone: str | None = None
    leave_address: str | None = None
    travel_from_date: date | None = None
    travel_to_date: date | None = None
    salary_in_advance: bool = False
    requires_acting_appointment: bool = False
    acting_officer_id: uuid.UUID | None = None
    expected_return_date: date | None = None


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
    professional_appointment_subtype: ProfAppointmentType | None = None
    reason: str | None = None
    contact_phone: str | None = None
    leave_address: str | None = None
    travel_from_date: date | None = None
    travel_to_date: date | None = None
    salary_in_advance: bool
    requires_acting_appointment: bool
    acting_officer_id: uuid.UUID | None = None
    expected_return_date: date | None = None
    head_of_dept_comments: str | None = None
    status: RequestStatus
    workflow_instance_id: uuid.UUID | None = None
    created_at: datetime
    updated_at: datetime


class LeaveRequestListPublic(BaseModel):
    data: list[LeaveRequestPublic]
    count: int
