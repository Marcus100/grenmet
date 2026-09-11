import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlmodel import Field, SQLModel

from src.utils.datetime import utc_now


class SavedSignature(SQLModel, table=True):
    __tablename__ = "saved_signature"
    __table_args__ = {"schema": "hr"}

    user_id: uuid.UUID = Field(primary_key=True, foreign_key="user.id")
    version: uuid.UUID = Field(default_factory=uuid.uuid4)
    image: bytes = Field(sa_column=sa.Column(sa.LargeBinary, nullable=False))
    updated_at: datetime = Field(default_factory=utc_now)


class SignedDocument(SQLModel, table=True):
    """Immutable submission evidence, committed with the form in one transaction."""

    __tablename__ = "signed_document"
    __table_args__ = (
        sa.UniqueConstraint(
            "entity_type", "entity_id", name="uq_signed_document_entity"
        ),
        {"schema": "hr"},
    )

    id: uuid.UUID = Field(default_factory=uuid.uuid4, primary_key=True)
    entity_type: str = Field(max_length=60)
    entity_id: uuid.UUID = Field(index=True)
    signer_id: uuid.UUID = Field(foreign_key="user.id", index=True)
    subject_id: uuid.UUID = Field(foreign_key="user.id")
    department_id: str = Field(foreign_key="hr.department.id")
    signer_name: str = Field(max_length=255)
    signature_version: uuid.UUID
    signed_at: datetime = Field(default_factory=utc_now)
    snapshot: str
    sha256: str = Field(max_length=64)
    pdf: bytes = Field(sa_column=sa.Column(sa.LargeBinary, nullable=False))
