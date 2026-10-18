import uuid
from datetime import date
from decimal import Decimal
from typing import Literal

from pydantic import Field

from src.hr.models import RequestStatus
from src.hr.signatures.schemas import SignatureConsent
from src.hr.submission import SubmittedFormPublic
from src.models import BaseModel, UtcDateTime

from .models import LeaveType, ProfAppointmentType


class LeaveRequestCreate(SignatureConsent):
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
    # Named colleagues who must all approve before the request reaches the
    # supervisor/management tiers. Ignored when as_draft is true.
    co_approver_user_ids: list[uuid.UUID] = Field(default_factory=list)
    # Save without submitting: persist as DRAFT with no approval chain yet.
    as_draft: bool = False


class LeaveRequestSubmit(SignatureConsent):
    co_approver_user_ids: list[uuid.UUID] = Field(default_factory=list)


class LeaveRequestAction(BaseModel):
    status: RequestStatus
    head_of_dept_comments: str | None = None


class LeaveRequestPublic(SubmittedFormPublic):
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
    created_at: UtcDateTime
    updated_at: UtcDateTime


class LeaveRequestListPublic(BaseModel):
    data: list[LeaveRequestPublic]
    count: int
    page: int = 1
    size: int = 100


class WorkingDayHoliday(BaseModel):
    holiday_date: date
    name: str
    # True when the date comes from the provisional list HR has not verified.
    provisional: bool


class WorkingDaysPublic(BaseModel):
    start: date
    end: date
    calendar_days: int
    working_days: int
    # "roster": counted from the caller's published roster (every day in the
    # range is rostered). "weekdays": Monday to Friday, used when it is not.
    method: Literal["roster", "weekdays"]
    # Public holidays inside the range that were not counted as working days.
    holidays: list[WorkingDayHoliday]
