import uuid
from datetime import date, datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from src.utils.datetime import utc_now


class ShiftCategory(str, Enum):
    WORK = "WORK"
    OFF = "OFF"
    LEAVE = "LEAVE"
    HOLIDAY = "HOLIDAY"


class RosterPeriodStatus(str, Enum):
    DRAFT = "DRAFT"
    PUBLISHED = "PUBLISHED"
    CLOSED = "CLOSED"


class ImportStatus(str, Enum):
    PENDING = "PENDING"
    VALIDATED = "VALIDATED"
    COMPLETED = "COMPLETED"
    FAILED = "FAILED"


class ShiftCatalog(SQLModel, table=True):
    __tablename__ = "shift_catalog"
    __table_args__ = {"schema": "hr"}

    code: str = Field(primary_key=True, max_length=10)
    label: str = Field(max_length=120)
    category: ShiftCategory
    start_time: str | None = Field(default=None, max_length=5)
    end_time: str | None = Field(default=None, max_length=5)
    counts_as_work_hours: bool = True
    needs_reason: bool = False
    needs_approval: bool = False
    is_active: bool = True
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class RosterPeriod(SQLModel, table=True):
    __tablename__ = "roster_period"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    period_start: date
    period_end: date
    status: RosterPeriodStatus = Field(default=RosterPeriodStatus.DRAFT)
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class RosterAssignment(SQLModel, table=True):
    __tablename__ = "roster_assignment"
    __table_args__ = (
        sa.UniqueConstraint(
            "user_id",
            "assignment_date",
            name="uq_hr_roster_assignment_user_date",
        ),
        {"schema": "hr"},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    roster_period_id: uuid.UUID = Field(foreign_key="hr.roster_period.id", index=True)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    assignment_date: date = Field(index=True)
    shift_code: str = Field(foreign_key="hr.shift_catalog.code", max_length=10)
    remarks: str | None = Field(default=None, max_length=500)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class PublicHoliday(SQLModel, table=True):
    __tablename__ = "public_holiday"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    name: str = Field(max_length=150)
    holiday_date: date = Field(index=True)
    is_recurring: bool = Field(default=False)
    country_code: str = Field(default="GD", max_length=3)
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utc_now)


class RosterRevisionAction(str, Enum):
    CREATED = "CREATED"
    ASSIGNMENTS_UPDATED = "ASSIGNMENTS_UPDATED"
    PUBLISHED = "PUBLISHED"
    CLOSED = "CLOSED"


class RosterRevision(SQLModel, table=True):
    __tablename__ = "roster_revision"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    roster_period_id: uuid.UUID = Field(foreign_key="hr.roster_period.id", index=True)
    revision_number: int = Field(ge=1)
    action: RosterRevisionAction
    changed_by_user_id: uuid.UUID = Field(foreign_key="user.id")
    summary: str | None = Field(default=None, max_length=500)
    snapshot: dict = Field(default_factory=dict, sa_column=sa.Column(sa.JSON))
    created_at: datetime = Field(default_factory=utc_now)


class RosterImportJob(SQLModel, table=True):
    __tablename__ = "roster_import_job"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    department_id: str = Field(foreign_key="hr.department.id", index=True)
    roster_period_id: uuid.UUID | None = Field(
        default=None, foreign_key="hr.roster_period.id"
    )
    file_name: str = Field(max_length=255)
    status: ImportStatus = Field(default=ImportStatus.PENDING)
    created_by_user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    total_rows: int = 0
    valid_rows: int = 0
    invalid_rows: int = 0
    error_summary: str | None = Field(default=None, max_length=2000)
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)


class RosterImportRow(SQLModel, table=True):
    __tablename__ = "roster_import_row"
    __table_args__ = {"schema": "hr"}

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    roster_import_job_id: uuid.UUID = Field(
        foreign_key="hr.roster_import_job.id", index=True
    )
    row_number: int = Field(ge=1)
    raw_data: dict[str, str] = Field(default_factory=dict, sa_column=sa.Column(sa.JSON))
    validation_errors: list[str] = Field(
        default_factory=list, sa_column=sa.Column(sa.JSON)
    )
    is_valid: bool = False
    created_at: datetime = Field(default_factory=utc_now)
