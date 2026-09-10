import uuid
from datetime import date, datetime
from enum import Enum

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

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


class EmployeeDocument(SQLModel, table=True):
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

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    organisation_id: str = Field(
        foreign_key="hr.organisation.id", index=True, max_length=100
    )
    user_id: uuid.UUID = Field(foreign_key="user.id", index=True, ondelete="CASCADE")
    category: DocumentCategory = Field(default=DocumentCategory.OTHER)
    sensitivity: DocumentSensitivity = Field(default=DocumentSensitivity.STANDARD)
    title: str = Field(max_length=255)
    description: str | None = Field(default=None, max_length=2000)

    # Storage location. Unique so a row is never orphaned onto another row's
    # object, and so a replayed upload cannot silently share a key.
    object_key: str = Field(max_length=512, unique=True, index=True)
    original_filename: str = Field(max_length=255)
    content_type: str = Field(max_length=120)
    size_bytes: int = Field(ge=0)

    issued_date: date | None = Field(default=None)
    expiry_date: date | None = Field(default=None)
    issuing_authority: str | None = Field(default=None, max_length=255)
    reference_number: str | None = Field(default=None, max_length=120)

    # Generic attachment link, so any existing HR form (absentee report, leave
    # request, parking permit) can carry evidence without its own join table.
    # Deliberately not a FK: the target table varies by entity_type.
    entity_type: str | None = Field(default=None, max_length=60)
    entity_id: uuid.UUID | None = Field(default=None)

    uploaded_by_user_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    archived_at: datetime | None = Field(default=None)
    archived_by_user_id: uuid.UUID | None = Field(
        default=None, foreign_key="user.id", ondelete="SET NULL"
    )
    created_at: datetime = Field(default_factory=utc_now)
    updated_at: datetime = Field(default_factory=utc_now)
