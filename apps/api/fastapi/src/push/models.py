import uuid
from datetime import datetime

import sqlalchemy as sa
from sqlalchemy import String, Text
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class PushSubscription(Base):
    """One browser's Web Push subscription for one list (no account, no PII)."""

    __tablename__ = "push_subscription"
    __table_args__ = (
        sa.UniqueConstraint(
            "list_key", "endpoint", name="push_subscription_list_key_endpoint_key"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    list_key: Mapped[str] = mapped_column(String(40))
    endpoint: Mapped[str] = mapped_column(Text)
    p256dh: Mapped[str] = mapped_column(String(255))
    auth: Mapped[str] = mapped_column(String(255))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    last_success_at: Mapped[datetime | None]
    failure_count: Mapped[int] = mapped_column(default=0, server_default="0")
