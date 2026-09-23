"""Drain the notification email outbox. Called by the worker; testable without Redis.

React Email (the shared ``notification`` template, rendered by web-auth) is tried
first; the autoescaped Jinja/MJML copy is the fallback so mail still goes out
when the render service is unavailable. Delivery itself goes through
:func:`src.email.send_email` (Resend in deployed environments, SMTP locally).
"""

import asyncio
import logging
from collections.abc import Callable
from datetime import timedelta
from pathlib import Path

from jinja2 import Environment, FileSystemLoader, select_autoescape
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from src import email as email_module
from src.auth.models import User
from src.email_config import email_settings
from src.utils.datetime import utc_now

from .config import notification_settings
from .models import DeliveryStatus, Notification, NotificationDelivery

logger = logging.getLogger(__name__)

Sender = Callable[..., None]

# Same backoff curve as the CAP outbox (src/worker/dispatch.py).
_RETRY_BASE_SECONDS = 10
_RETRY_MAX_SECONDS = 3600

_templates = Environment(
    loader=FileSystemLoader(
        Path(__file__).parent.parent.parent / "email-templates" / "build"
    ),
    autoescape=select_autoescape(["html"]),
)


def _retry_delay_seconds(attempts: int) -> int:
    return min(_RETRY_BASE_SECONDS << max(attempts - 1, 0), _RETRY_MAX_SECONDS)


def link_url(link_path: str | None) -> str | None:
    if not link_path:
        return None
    return f"{notification_settings.NOTIFICATIONS_WEB_BASE_URL.rstrip('/')}{link_path}"


async def render_email(notification: Notification) -> tuple[str, str]:
    """Return (subject, html) for a notification."""
    project_name = email_settings.PROJECT_NAME
    url = link_url(notification.link_path)
    if email_settings.EMAIL_RENDER_URL:
        try:
            rendered = await email_module._render_remote(  # noqa: SLF001 - shared renderer
                "notification",
                {
                    "projectName": project_name,
                    "title": notification.title,
                    "body": notification.body,
                    "linkUrl": url,
                },
            )
            return rendered.subject, rendered.html_content
        except Exception:  # noqa: BLE001 - any render failure falls back to Jinja
            logger.warning("React Email render failed; using Jinja fallback")
    html = _templates.get_template("notification.html").render(
        project_name=project_name,
        title=notification.title,
        body=notification.body,
        link_url=url,
    )
    return notification.title, html


async def _deliver(
    session: AsyncSession, delivery: NotificationDelivery, sender: Sender
) -> None:
    delivery.attempts += 1
    delivery.updated_at = utc_now()
    notification = await session.get(Notification, delivery.notification_id)
    user = (
        await session.get(User, notification.recipient_user_id)
        if notification
        else None
    )
    skip_reason = None
    if notification is None or user is None or not user.is_active:
        skip_reason = "Recipient no longer active"
    elif not user.email:
        skip_reason = "No email address"
    elif not notification_settings.email_allowed(user.email):
        skip_reason = "Email domain not allowed in this environment"
    elif not email_settings.emails_enabled:
        skip_reason = "Email is not configured"
    if skip_reason:
        delivery.status = DeliveryStatus.SKIPPED.value
        delivery.last_error = skip_reason
        return
    assert notification is not None and user is not None
    try:
        subject, html = await render_email(notification)
        await asyncio.to_thread(
            sender, email_to=user.email, subject=subject, html_content=html
        )
    except Exception as exc:  # noqa: BLE001 - one failure must not stop the batch
        delivery.status = DeliveryStatus.FAILED.value
        delivery.last_error = str(exc)[:1000]
        delivery.next_retry_at = utc_now() + timedelta(
            seconds=_retry_delay_seconds(delivery.attempts)
        )
        logger.warning(
            "Notification email failed", extra={"delivery_id": str(delivery.id)}
        )
        return
    delivery.status = DeliveryStatus.SENT.value
    delivery.sent_at = utc_now()
    delivery.last_error = None
    delivery.next_retry_at = None


async def process_due_deliveries(
    *,
    session: AsyncSession,
    limit: int | None = None,
    max_attempts: int | None = None,
    sender: Sender | None = None,
) -> int:
    """Send pending emails and due retries. Returns how many were handled."""
    limit = limit or notification_settings.NOTIFICATIONS_BATCH_SIZE
    max_attempts = max_attempts or notification_settings.NOTIFICATIONS_MAX_ATTEMPTS
    send = sender or email_module.send_email
    now = utc_now()
    due = (
        select(NotificationDelivery)
        .where(
            or_(
                NotificationDelivery.status == DeliveryStatus.PENDING.value,
                (NotificationDelivery.status == DeliveryStatus.FAILED.value)
                & (NotificationDelivery.attempts < max_attempts)
                & (
                    NotificationDelivery.next_retry_at.is_(None)
                    | (NotificationDelivery.next_retry_at <= now)
                ),
            )
        )
        .order_by(NotificationDelivery.created_at)
        .limit(1)
        # Claim one row per transaction so a commit never releases rows another
        # worker could then send twice.
        .with_for_update(skip_locked=True)
    )
    handled = 0
    while handled < limit:
        delivery = await session.scalar(due)
        if delivery is None:
            break
        await _deliver(session, delivery, send)
        await session.commit()
        handled += 1
    if handled:
        logger.info("Processed notification emails", extra={"count": handled})
    return handled
