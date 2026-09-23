import uuid
from datetime import datetime
from typing import Any

import sqlalchemy as sa
from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class AuditEntry(Base):
    """One create/update/delete of a tracked row.

    ``entity_type``/``entity_id`` is the subject the history is read under (e.g.
    every profile, address and employment change groups under ``employee`` +
    user id); ``record_type``/``record_id`` is the concrete row that changed.
    Values of sensitive fields are stored and masked on read, never dropped.
    """

    __tablename__ = "audit_entry"
    __table_args__ = (
        sa.Index("ix_audit_entry_entity", "entity_type", "entity_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    entity_type: Mapped[str] = mapped_column(String(60))
    entity_id: Mapped[str] = mapped_column(String(100))
    record_type: Mapped[str] = mapped_column(String(60))
    record_id: Mapped[str] = mapped_column(String(100))
    organisation_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    action: Mapped[str] = mapped_column(String(20))
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True, index=True
    )
    changes: Mapped[list[dict[str, Any]]] = mapped_column(JSON, default=list)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
