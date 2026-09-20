import uuid
from datetime import date, datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class DocumentCategory(str, Enum):
    CONTRACT = "CONTRACT"
    IDENTIFICATION = "IDENTIFICATION"
    CERTIFICATION = "CERTIFICATION"
    LICENCE = "LICENCE"
    QUALIFICATION = "QUALIFICATION"
    MEDICAL = "MEDICAL"
    DISCIPLINARY = "DISCIPLINARY"
    APPRAISAL = "APPRAISAL"
    SIGNED_FORM = "SIGNED_FORM"
    OTHER = "OTHER"


class DocumentSensitivity(str, Enum):
    STANDARD = "STANDARD"
    RESTRICTED = "RESTRICTED"


# Sensitivity is derived from the category on write and never taken from the
# caller, so a medical certificate cannot be filed as STANDARD and widen its own
# audience. Adding a category here retroactively restricts nothing already
# stored — existing rows keep the sensitivity they were written with.
RESTRICTED_CATEGORIES = frozenset(
    {
        DocumentCategory.MEDICAL,
        DocumentCategory.DISCIPLINARY,
        DocumentCategory.APPRAISAL,
    }
)


def sensitivity_for(category: DocumentCategory) -> DocumentSensitivity:
    return (
        DocumentSensitivity.RESTRICTED
        if category in RESTRICTED_CATEGORIES
        else DocumentSensitivity.STANDARD
    )


class EmployeeDocument(Base):
    """A stored file belonging to a person, optionally attached to an HR record.

    The file itself lives in object storage under ``object_key``; this row is the
    only index of it. Rows are archived, never deleted — an HR document is
    evidence, and its disappearance is itself a fact worth keeping.
    """

    __tablename__ = "employee_document"
    __table_args__ = (
        sa.Index("ix_hr_employee_document_user_id_category", "user_id", "category"),
        # The expiry engine (stage 1.2) sweeps this column across all users.
        sa.Index("ix_hr_employee_document_expiry_date", "expiry_date"),
        sa.Index("ix_hr_employee_document_entity", "entity_type", "entity_id"),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id"), index=True
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), index=True
    )
    category: Mapped[DocumentCategory] = mapped_column(default=DocumentCategory.OTHER)
    sensitivity: Mapped[DocumentSensitivity] = mapped_column(
        default=DocumentSensitivity.STANDARD
    )
    title: Mapped[str] = mapped_column(String(255))
    description: Mapped[str | None] = mapped_column(String(2000), nullable=True)

    # Storage location. Unique so a row is never orphaned onto another row's
    # object, and so a replayed upload cannot silently share a key.
    object_key: Mapped[str] = mapped_column(String(512), unique=True, index=True)
    original_filename: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(120))
    size_bytes: Mapped[int]

    issued_date: Mapped[date | None]
    expiry_date: Mapped[date | None]
    issuing_authority: Mapped[str | None] = mapped_column(String(255), nullable=True)
    reference_number: Mapped[str | None] = mapped_column(String(120), nullable=True)

    # Generic attachment link, so any existing HR form (absentee report, leave
    # request, parking permit) can carry evidence without its own join table.
    # Deliberately not a FK: the target table varies by entity_type.
    entity_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entity_id: Mapped[uuid.UUID | None]

    uploaded_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    archived_at: Mapped[datetime | None]
    archived_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)
