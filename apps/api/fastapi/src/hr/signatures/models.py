import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import ForeignKey, LargeBinary, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class SavedSignature(Base):
    __tablename__ = "saved_signature"
    __table_args__ = {"schema": "hr"}

    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), primary_key=True)
    version: Mapped[uuid.UUID] = mapped_column(default=uuid.uuid4)
    image: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class SignedDocument(Base):
    """Immutable submission evidence, committed with the form in one transaction."""

    __tablename__ = "signed_document"
    __table_args__ = (
        sa.UniqueConstraint(
            "entity_type", "entity_id", name="uq_signed_document_entity"
        ),
        {"schema": "hr"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[uuid.UUID] = mapped_column(index=True)
    signer_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"), index=True)
    subject_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("user.id"))
    department_id: Mapped[str] = mapped_column(ForeignKey("hr.department.id"))
    signer_name: Mapped[str] = mapped_column(String(255))
    signature_version: Mapped[uuid.UUID]
    signed_at: Mapped[datetime] = mapped_column(default=utc_now)
    snapshot: Mapped[str]
    sha256: Mapped[str] = mapped_column(String(64))
    pdf: Mapped[bytes] = mapped_column(LargeBinary, nullable=False)
