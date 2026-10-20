"""Outbox topics owned by notifications (ADR-0026).

``email.send`` turns an outbox row into an ``OutboundEmail`` row in the same
transaction as the outbox row's ``done`` status, so it runs once; the existing
email worker then sends it. Payload keys: ``to_email``, ``subject``,
``transactional`` (bool; non-transactional mail skips suppressed addresses), and
either ``html`` or ``template`` with ``props``.

Import this module (the worker does at startup) to register the handler.
"""

from datetime import datetime
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox

from . import service

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


@outbox.handler(EMAIL_SEND)
async def send_email(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    payload = message.payload
    service.enqueue_email(
        session=session,
        to_email=payload["to_email"],
        subject=payload["subject"],
        transactional=bool(payload.get("transactional", False)),
        template=payload.get("template"),
        props=payload.get("props") or {},
        html=payload.get("html"),
    )
    await session.flush()
