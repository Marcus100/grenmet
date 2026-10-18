import uuid
from datetime import datetime
from enum import Enum
from typing import Any

import sqlalchemy as sa
from sqlalchemy import JSON, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now


class DeliveryStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"


class Notification(Base):
    """One in-app notification for one person. Always recorded, never muted."""

    __tablename__ = "notification"
    __table_args__ = (
        sa.Index(
            "ix_notification_recipient_inbox",
            "recipient_user_id",
            "read_at",
            "created_at",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    recipient_user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE")
    )
    event_key: Mapped[str] = mapped_column(String(80))
    organisation_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Deliberately minimal: a summary and a link. Reasons, medical detail and
    # approver comments stay behind the login.
    title: Mapped[str] = mapped_column(String(200))
    body: Mapped[str] = mapped_column(String(1000), default="")
    link_path: Mapped[str | None] = mapped_column(String(300), nullable=True)
    entity_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    # Per-recipient idempotency key for reminders (e.g. a 7-day expiry notice).
    dedupe_key: Mapped[str | None] = mapped_column(
        String(300), nullable=True, unique=True
    )
    read_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class NotificationDelivery(Base):
    """Email outbox row for a notification; drained by the worker."""

    __tablename__ = "notification_delivery"
    __table_args__ = (
        sa.Index("ix_notification_delivery_due", "status", "next_retry_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    notification_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("notification.id", ondelete="CASCADE"), index=True
    )
    channel: Mapped[str] = mapped_column(String(20), default="email")
    status: Mapped[str] = mapped_column(
        String(20), default=DeliveryStatus.PENDING.value
    )
    attempts: Mapped[int] = mapped_column(default=0)
    next_retry_at: Mapped[datetime | None]
    last_error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    sent_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class NotificationSetting(Base):
    """An organisation's override of an event's defaults. No row = defaults."""

    __tablename__ = "notification_setting"
    __table_args__ = (
        sa.UniqueConstraint(
            "organisation_id", "event_key", name="uq_notification_setting_event"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str] = mapped_column(
        String(100), ForeignKey("hr.organisation.id", ondelete="CASCADE")
    )
    event_key: Mapped[str] = mapped_column(String(80))
    enabled: Mapped[bool] = mapped_column(default=True)
    email_enabled: Mapped[bool] = mapped_column(default=True)
    recipient_roles: Mapped[list[str]] = mapped_column(JSON, default=list)
    title_template: Mapped[str | None] = mapped_column(String(200), nullable=True)
    body_template: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    params: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    updated_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class NotificationPreference(Base):
    """A person's email opt-out for one event. In-app is always kept."""

    __tablename__ = "notification_preference"

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("user.id", ondelete="CASCADE"), primary_key=True
    )
    event_key: Mapped[str] = mapped_column(String(80), primary_key=True)
    email_enabled: Mapped[bool] = mapped_column(default=True)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now)


class NotificationSnooze(Base):
    """Silences an event (or one entity of it) until ``until``, e.g. planned work."""

    __tablename__ = "notification_snooze"
    __table_args__ = (sa.Index("ix_notification_snooze_event", "event_key", "until"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    # None covers every organisation.
    organisation_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    event_key: Mapped[str] = mapped_column(String(80))
    entity_type: Mapped[str | None] = mapped_column(String(60), nullable=True)
    entity_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    until: Mapped[datetime]
    reason: Mapped[str] = mapped_column(String(300), default="")
    created_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("user.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class SuppressionReason(str, Enum):
    HARD_BOUNCE = "hard_bounce"
    COMPLAINT = "complaint"


class EmailSuppression(Base):
    """An address that must not receive non-transactional email.

    Written by the Resend webhook (hard bounce, spam complaint). One row per
    address (lower-cased); a replayed webhook finds the row and changes nothing.
    Transactional mail (sign-in codes, password resets) ignores this list.
    """

    __tablename__ = "email_suppression"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True)
    reason: Mapped[str] = mapped_column(String(30))
    source_event_id: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(default=utc_now)


class OutboundEmailStatus(str, Enum):
    PENDING = "pending"
    SENT = "sent"
    FAILED = "failed"
    SKIPPED = "skipped"


class OutboundEmail(Base):
    """Email outbox for public flows (subscriptions, contact messages).

    Rows are written inside the request transaction and drained by the worker,
    so a request never waits on Resend. Either ``template`` + ``props`` (React
    Email render, Jinja fallback) or pre-rendered ``html`` is set.
    Non-transactional rows are skipped for suppressed addresses.
    """

    __tablename__ = "outbound_email"
    __table_args__ = (sa.Index("ix_outbound_email_due", "status", "next_retry_at"),)

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    to_email: Mapped[str] = mapped_column(String(320))
    subject: Mapped[str] = mapped_column(String(300))
    template: Mapped[str | None] = mapped_column(String(60), nullable=True)
    props: Mapped[dict[str, Any]] = mapped_column(JSON, default=dict)
    html: Mapped[str | None] = mapped_column(sa.Text, nullable=True)
    transactional: Mapped[bool] = mapped_column(default=False)
    status: Mapped[str] = mapped_column(
        String(20), default=OutboundEmailStatus.PENDING.value
    )
    attempts: Mapped[int] = mapped_column(default=0)
    next_retry_at: Mapped[datetime | None]
    last_error: Mapped[str | None] = mapped_column(String(1000), nullable=True)
    sent_at: Mapped[datetime | None]
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
