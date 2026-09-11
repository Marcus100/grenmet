import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from src.utils.datetime import utc_now


class TrainingRecord(SQLModel, table=True):
    """A historical training outcome; corrections archive and replace the record."""

    __tablename__ = "training_record"
    __table_args__ = (
        sa.ForeignKeyConstraint(
            ["department_id", "organisation_id"],
            ["hr.department.id", "hr.department.organisation_id"],
            name="fk_training_department_org",
        ),
        sa.CheckConstraint(
            "result IN ('completed', 'attended', 'failed')", name="ck_training_result"
        ),
        sa.CheckConstraint(
            "expires_on IS NULL OR (result = 'completed' AND expires_on >= completed_on)",
            name="ck_training_expiry",
        ),
        {"schema": "hr"},
    )
    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organisation_id: str = Field(
        foreign_key="hr.organisation.id", index=True, max_length=100
    )
    department_id: str = Field(max_length=100)
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    course_name: str = Field(max_length=200)
    provider: str = Field(max_length=200)
    completed_on: date
    result: str = Field(max_length=20)
    expires_on: date | None = None
    notes: str | None = Field(default=None, max_length=2000)
    created_by: uuid.UUID = Field(foreign_key="user.id")
    created_at: datetime = Field(default_factory=utc_now)
    archived_at: datetime | None = None
    archived_by: uuid.UUID | None = Field(default=None, foreign_key="user.id")
    archive_reason: str | None = Field(default=None, max_length=500)
