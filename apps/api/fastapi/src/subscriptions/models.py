import uuid
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class SubscriptionStatus(str, Enum):
    PENDING = "pending"
    CONFIRMED = "confirmed"
    UNSUBSCRIBED = "unsubscribed"


class ListSubscription(Base):
    """One address on one mailing list, with its consent timestamps.

    Double opt-in: a row is ``pending`` until the emailed link is followed.
    ``list_key`` scopes the row to a product (e.g. ``signal``).
    """

    __tablename__ = "list_subscription"
    __table_args__ = (
        sa.UniqueConstraint(
            "list_key", "email", name="list_subscription_list_key_email_key"
        ),
        sa.Index("ix_list_subscription_email", "email"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    list_key: Mapped[str] = mapped_column(String(40))
    email: Mapped[str] = mapped_column(String(320))
    status: Mapped[str] = mapped_column(
        String(20), default=SubscriptionStatus.PENDING.value
    )
    requested_at: Mapped[datetime] = mapped_column(default=utc_now)
    last_confirmation_sent_at: Mapped[datetime | None]
    confirmed_at: Mapped[datetime | None]
    unsubscribed_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)
