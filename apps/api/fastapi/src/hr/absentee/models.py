import uuid
from datetime import date, datetime

from sqlmodel import Field, SQLModel

from src.hr.models import RequestStatus
from src.utils.datetime import utc_now


class AbsenteeReport(SQLModel, table=True):
    __tablename__ = "absentee_report"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    report_date: date
    expected_shift_code: str | None = Field(default=None, max_length=10)
    absence_start_time: str | None = Field(default=None, max_length=5)
    absence_end_time: str | None = Field(default=None, max_length=5)
    reason_code: str = Field(max_length=60)
    notes: str | None = Field(default=None, max_length=1000)
    contact_attempted: bool = Field(default=False)
    contact_method: str | None = Field(default=None, max_length=50)
    replacement_arranged: bool = Field(default=False)
    replacement_user_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    status: RequestStatus = Field(default=RequestStatus.SUBMITTED)
    workflow_instance_id: uuid.UUID | None = Field(
        default=None, foreign_key="hr.workflow_instance.id"
    )
    submitted_by_user_id: uuid.UUID = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
