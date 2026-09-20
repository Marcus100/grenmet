import uuid
from datetime import date, datetime

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class TrainingRecord(Base):
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

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    department_id: Mapped[str] = mapped_column(String(100))
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    course_name: Mapped[str] = mapped_column(String(200))
    provider: Mapped[str] = mapped_column(String(200))
    completed_on: Mapped[date]
    result: Mapped[str] = mapped_column(String(20))
    expires_on: Mapped[date | None]
    notes: Mapped[str | None] = mapped_column(String(2000), nullable=True)
    created_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    archived_at: Mapped[datetime | None]
    archived_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id"), nullable=True
    )
    archive_reason: Mapped[str | None] = mapped_column(String(500), nullable=True)
