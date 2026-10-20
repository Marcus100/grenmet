"""Outbox topics owned by notifications (ADR-0026). The outbox is the only email
retry engine: 1 minute backoff doubling to 1 hour, ``dead`` after 5 failures.

``email.send`` carries the whole message (keys ``to_email``, ``subject``,
``transactional`` (bool; non-transactional mail skips suppressed addresses), and
either ``html`` or ``template`` with ``props``). Its handler sends it and writes
an ``OutboundEmail`` delivery-log row (sent, skipped or, once dead, failed; never a
body). The outbox clears the payload when the row is done.

``email.deliver`` (``service.EMAIL_DELIVER``) is queued by ``service.enqueue_email``
and ``enqueue_email_once``: the payload is only the id of an ``OutboundEmail`` row
that holds the content and doubles as the delivery log. The handler sends it, and
clears the row's content when it is final (sent, skipped or dead).

Import this module (the worker does at startup) to register the handler.
"""

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox

from . import dispatch, service
from .models import OutboundEmail, OutboundEmailStatus

EMAIL_SEND = "email.send"


async def enqueue_email(
    session: AsyncSession,
    *,
    to_email: str,
    subject: str,
    dedupe_key: str,
    transactional: bool,
    html: str | None = None,
    template: str | None = None,
    props: dict[str, Any] | None = None,
    organisation_id: str | None = None,
    run_at: datetime | None = None,
) -> bool:
    """Queue an email through the outbox; no commit. Returns False for a repeat."""
    if html is None and template is None:
        raise ValueError("An email needs html or a template")
    return await outbox.enqueue(
        session,
        topic=EMAIL_SEND,
        dedupe_key=dedupe_key,
        organisation_id=organisation_id,
        run_at=run_at,
        payload={
            "to_email": to_email,
            "subject": subject,
            "transactional": transactional,
            "html": html,
            "template": template,
            "props": props or {},
        },
    )


def _log_row(payload: dict[str, Any]) -> OutboundEmail:
    return OutboundEmail(
        id=uuid.uuid4(),
        to_email=service.normalise_email(payload["to_email"]),
        subject=str(payload["subject"])[:300],
        template=payload.get("template"),
        props=payload.get("props") or {},
        html=payload.get("html"),
        transactional=bool(payload.get("transactional", False)),
    )


async def _email_send_dead(
    session: AsyncSession, message: outbox.OutboxMessage, error: Exception
) -> None:
    row = _log_row(message.payload)
    row.status = OutboundEmailStatus.FAILED.value
    row.attempts = message.attempts + 1
    row.last_error = f"Delivery failed: {type(error).__name__}"
    row.props = {}
    row.html = None
    session.add(row)


@outbox.handler(EMAIL_SEND, on_dead=_email_send_dead)
async def send_email(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    row = _log_row(message.payload)
    await dispatch.send_outbound_row(session, row, attempts=message.attempts + 1)
    session.add(row)
    await session.flush()


async def _locked_row(
    session: AsyncSession, message: outbox.OutboxMessage
) -> OutboundEmail | None:
    result = await session.execute(
        select(OutboundEmail)
        .where(OutboundEmail.id == uuid.UUID(message.payload["outbound_email_id"]))
        .with_for_update()
    )
    return result.scalar_one_or_none()


async def _email_deliver_dead(
    session: AsyncSession, message: outbox.OutboxMessage, error: Exception
) -> None:
    row = await _locked_row(session, message)
    if row is None or row.status != OutboundEmailStatus.PENDING.value:
        return
    row.status = OutboundEmailStatus.FAILED.value
    row.attempts = message.attempts + 1
    row.last_error = f"Delivery failed: {type(error).__name__}"
    row.next_retry_at = None
    row.props = {}
    row.html = None


@outbox.handler(service.EMAIL_DELIVER, on_dead=_email_deliver_dead)
async def deliver_email(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    row = await _locked_row(session, message)
    # A row that is no longer pending was already settled (for example by an
    # older worker's drain during a deploy): nothing to send.
    if row is None or row.status != OutboundEmailStatus.PENDING.value:
        return
    await dispatch.send_outbound_row(session, row, attempts=message.attempts + 1)
    await session.flush()
