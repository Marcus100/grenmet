"""Organisation-scoped upload records (F8). The table lives in the ``org`` schema."""

import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class UploadStatus(str, Enum):
    PENDING = "pending"
    COMPLETE = "complete"


class OrgUpload(Base):
    __tablename__ = "upload"
    __table_args__ = (
        sa.CheckConstraint("status IN ('pending', 'complete')", name="status"),
        sa.CheckConstraint("size_bytes > 0", name="size"),
        sa.Index("ix_org_upload_organisation", "organisation_id"),
        {"schema": "org"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("org.organisation.id", ondelete="CASCADE")
    )
    app: Mapped[str] = mapped_column(String(60))
    purpose: Mapped[str] = mapped_column(String(60))
    object_key: Mapped[str] = mapped_column(String(300), unique=True)
    content_type: Mapped[str] = mapped_column(String(60))
    size_bytes: Mapped[int]
    status: Mapped[str] = mapped_column(String(20), default=UploadStatus.PENDING.value)
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    expires_at: Mapped[datetime]
    completed_at: Mapped[datetime | None]
