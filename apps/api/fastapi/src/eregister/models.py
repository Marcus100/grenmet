"""Send log in the application database.

Observations live in the separate eRegister database, so a send cannot share a
transaction with them; it does share one with the notifications outbox
(``outbound_email``) and is the durable job record for the WIS2 transfer.
``observation_id`` is therefore a plain UUID, not a foreign key.
"""

import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now

TARGET_EMAIL = "email"
TARGET_WIS2 = "wis2"
STATUS_QUEUED = "queued"
STATUS_SENT = "sent"
STATUS_FAILED = "failed"


class ERegisterSend(Base):
    __tablename__ = "eregister_send"
    __table_args__ = (
        sa.Index("ix_eregister_send_observation", "observation_id", "created_at"),
        sa.Index("ix_eregister_send_due", "target", "status", "next_retry_at"),
        sa.CheckConstraint("target IN ('email', 'wis2')", name="target"),
        sa.CheckConstraint("status IN ('queued', 'sent', 'failed')", name="status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    observation_id: Mapped[uuid.UUID]
    station_id: Mapped[str] = mapped_column(String(64))
    observed_at: Mapped[datetime]
    target: Mapped[str] = mapped_column(String(10))
    status: Mapped[str] = mapped_column(String(10), default=STATUS_QUEUED)
    # Email: number of recipients. WIS2: unused.
    recipients: Mapped[int | None]
    # Email: outbound_email ids. WIS2: object key, file name and CSV content.
    detail: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    attempts: Mapped[int] = mapped_column(default=0)
    next_retry_at: Mapped[datetime | None]
    last_error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    sent_at: Mapped[datetime | None]
    created_by: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
