import uuid
from datetime import date

from src.hr.absentee.models import AbsenceReason
from src.hr.models import RequestStatus
from src.models import BaseModel, UtcDateTime


class AbsenteeReportCreate(BaseModel):
    user_id: uuid.UUID
    department_id: str
    report_date: date
    expected_shift_code: str | None = None
    absence_start_time: str | None = None
    absence_end_time: str | None = None
    reason: AbsenceReason
    notes: str | None = None
    contact_attempted: bool = False
    contact_method: str | None = None
    replacement_arranged: bool = False
    replacement_user_id: uuid.UUID | None = None


class AbsenteeReportPublic(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    department_id: str
    report_date: date
    expected_shift_code: str | None = None
    absence_start_time: str | None = None
    absence_end_time: str | None = None
    reason: AbsenceReason
    notes: str | None = None
    contact_attempted: bool
    contact_method: str | None = None
    replacement_arranged: bool
    replacement_user_id: uuid.UUID | None = None
    status: RequestStatus
    workflow_instance_id: uuid.UUID | None = None
    submitted_by_user_id: uuid.UUID
    created_at: UtcDateTime
    updated_at: UtcDateTime


class AbsenteeReportListPublic(BaseModel):
    data: list[AbsenteeReportPublic]
    count: int
    page: int = 1
    size: int = 100
