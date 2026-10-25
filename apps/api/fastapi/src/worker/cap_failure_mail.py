"""Email GMS when a warning delivery job has failed on every attempt.

Goes through the notifications outbox (``enqueue_email_once``), one email per
failed job and recipient: the dedupe key holds the job id, so re-running the
check never resends. The message holds the alert headline, channel, attempts
and the error class only: no subscriber addresses, payloads or error text.
"""

from __future__ import annotations

from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapAlert, CapJobEvent
from src.email_config import email_settings
from src.notifications import service as notification_service
from src.worker import cap_content
from src.worker.config import worker_settings


def recipients() -> list[str]:
    raw = worker_settings.CAP_DELIVERY_FAILURE_RECIPIENTS
    return [item.strip() for item in raw.split(",") if item.strip()]


async def _headline(*, session: AsyncSession, job: CapJobEvent) -> str:
    if job.alert_id is None:
        return "(no alert)"
    alert = await session.get(CapAlert, job.alert_id)
    if alert is None:
        return "(alert not found)"
    content = await cap_content.load_content(session=session, alert=alert)
    return content.headline if content else alert.identifier


async def queue_failure_emails(
    *, session: AsyncSession, jobs: list[CapJobEvent]
) -> int:
    """Queue one email per recipient per failed job. The caller commits."""
    to = recipients()
    if not to:
        return 0
    queued = 0
    for job in jobs:
        headline = await _headline(session=session, job=job)
        error_class = (job.result or {}).get("error_class") or "unknown"
        channel = job.kind.removeprefix("publish.")
        title = f"Warning delivery failed ({channel})"
        body = (
            f"Warning: {headline}. Delivery channel: {channel}. "
            f"Attempts: {job.attempts}. Last error: {error_class}. "
            "It will not be retried automatically."
        )
        for address in to:
            created = await notification_service.enqueue_email_once(
                session=session,
                to_email=address,
                subject=title,
                dedupe_key=f"cap-job-failed:{job.id}:{address}",
                template="notification",
                props={
                    "projectName": email_settings.PROJECT_NAME,
                    "title": title,
                    "body": body,
                    "linkUrl": None,
                },
            )
            queued += int(created)
    return queued
