"""Email GMS when a warning delivery job has failed on every attempt.

Goes through the notifications outbox (``enqueue_email_once``), one email per
failed job and recipient: the dedupe key holds the job id, so re-running the
check never resends. The message holds the alert headline, channel, attempts
and the error class only: no subscriber addresses, payloads or error text.
"""

from __future__ import annotations

import logging

from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapAlert, CapJobEvent
from src.email_config import email_settings
from src.notifications import service as notification_service
from src.worker import cap_content, dispatch
from src.worker.config import worker_settings

logger = logging.getLogger(__name__)


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
    """Queue one email per recipient per failed job. The caller commits.

    A recipient with no account is skipped (issue 1629). When every recipient of a
    job is skipped, the failure is logged at ERROR (Sentry) once, when the job is
    first reported: the alert reached nobody. The log names the count and job id,
    never an address."""
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
        skipped = 0
        for address in to:
            # Issue 1629: a configured address with no account is not mailed. The
            # log names no address.
            if not await notification_service.has_account(
                session=session, email=address
            ):
                skipped += 1
                logger.warning(
                    "CAP failure email skipped: recipient has no account",
                    extra={"job_id": str(job.id)},
                )
                continue
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
        if skipped == len(to) and not dispatch.failure_reported(job):
            logger.error(
                "CAP failure alert reached no deliverable recipient",
                extra={"job_id": str(job.id), "skipped": skipped},
            )
    return queued
