"""Outbound webhook endpoints and their delivery audit trail (ADR-0029, PF6)."""

import secrets
from datetime import datetime
from enum import Enum

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import ARRAY
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class EndpointStatus(str, Enum):
    ACTIVE = "active"
    DISABLED = "disabled"


class DeliveryStatus(str, Enum):
    PENDING = "pending"
    SUCCEEDED = "succeeded"
    FAILED = "failed"  # last attempt failed; the outbox will retry
    DEAD = "dead"  # gave up, or the endpoint was disabled


def new_endpoint_id() -> str:
    return f"whe_{secrets.token_hex(8)}"


def new_delivery_id() -> str:
    return f"whd_{secrets.token_hex(8)}"


def new_event_id() -> str:
    return f"evt_{secrets.token_hex(12)}"


class WebhookEndpoint(Base):
    """One receiver URL an organisation registered.

    ``secret_encrypted`` is a ``secret_box`` token of the ``whsec_`` signing secret;
    it is shown once at creation or rotation and never returned again.
    """

    __tablename__ = "endpoint"
    __table_args__ = (
        sa.Index("endpoint_organisation_id_idx", "organisation_id"),
        sa.CheckConstraint("status IN ('active', 'disabled')", name="status"),
        {"schema": "webhooks"},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    organisation_id: Mapped[str] = mapped_column(
        ForeignKey("org.organisation.id", ondelete="CASCADE")
    )
    url: Mapped[str] = mapped_column(String(2048))
    description: Mapped[str | None] = mapped_column(String(255))
    event_types: Mapped[list[str]] = mapped_column(ARRAY(String(60)), default=list)
    secret_encrypted: Mapped[str] = mapped_column(Text)
    status: Mapped[str] = mapped_column(String(10), default=EndpointStatus.ACTIVE.value)
    consecutive_failures: Mapped[int] = mapped_column(default=0)
    disabled_reason: Mapped[str | None] = mapped_column(String(200))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


class WebhookDelivery(Base):
    """Audit trail of one event for one endpoint. Never holds the payload: the
    body is rebuilt from the outbox row, which the outbox clears when done."""

    __tablename__ = "delivery"
    __table_args__ = (
        sa.UniqueConstraint("endpoint_id", "event_id"),
        sa.CheckConstraint(
            "status IN ('pending', 'succeeded', 'failed', 'dead')", name="status"
        ),
        sa.Index("delivery_endpoint_id_created_at_idx", "endpoint_id", "created_at"),
        {"schema": "webhooks"},
    )

    id: Mapped[str] = mapped_column(String(100), primary_key=True)
    endpoint_id: Mapped[str] = mapped_column(
        ForeignKey("webhooks.endpoint.id", ondelete="CASCADE")
    )
    event_id: Mapped[str] = mapped_column(String(60))
    event_type: Mapped[str] = mapped_column(String(60))
    attempts: Mapped[int] = mapped_column(default=0)
    status: Mapped[str] = mapped_column(
        String(10), default=DeliveryStatus.PENDING.value
    )
    response_status: Mapped[int | None]
    last_error: Mapped[str | None] = mapped_column(String(300))
    next_attempt_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)
