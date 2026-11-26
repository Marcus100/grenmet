"""Outbox topic owned by opslog (ADR-0026, ADR-0067): ``opslog.entry_post``.

Other modules enqueue it to write an automatic entry (payload: ``messages.py``).
The handler only writes to the main database, so its write and the row's
``done`` commit together; it also skips a message whose entry already exists, so
a repeated delivery adds nothing. A payload that cannot be read, or that names a
log of another organisation, is dead-lettered (``TerminalFailure``) so the
sender's mistake is visible. An organisation without the entitlement, without a
receiving log, or whose named log was archived since is not an error: the message
is dropped and logged.

Imported by the worker through the manifest's ``worker_modules``.
"""

import logging

from pydantic import ValidationError
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.organisations import service as org_service

from . import service
from .messages import ENTRY_POST_TOPIC, EntryPostPayload

logger = logging.getLogger(__name__)

ENTITLEMENT = "opslog"


@outbox.handler(ENTRY_POST_TOPIC)
async def entry_post(session: AsyncSession, message: outbox.OutboxMessage) -> None:
    if message.organisation_id is None:
        raise outbox.TerminalFailure("opslog.entry_post needs an organisation")
    try:
        payload = EntryPostPayload.model_validate(message.payload)
    except ValidationError as exc:
        raise outbox.TerminalFailure("opslog.entry_post payload is not valid") from exc
    if await service.entry_for_message(session, message.id) is not None:
        return
    if not await org_service.is_app_enabled(
        session, organisation_id=message.organisation_id, app_key=ENTITLEMENT
    ):
        logger.info(
            "opslog.entry_post for an organisation without the operations log; dropped",
            extra={"organisation_id": message.organisation_id},
        )
        return
    log = await service.receiving_log(
        session, organisation_id=message.organisation_id, log_id=payload.log_id
    )
    if log is None:
        if payload.log_id is not None:
            if not await service.log_exists(
                session, organisation_id=message.organisation_id, log_id=payload.log_id
            ):
                # Another organisation's log or a typo: the sender's mistake.
                raise outbox.TerminalFailure("opslog.entry_post names no log here")
            logger.info(
                "opslog.entry_post for an archived log; dropped",
                extra={"organisation_id": message.organisation_id},
            )
            return
        logger.info(
            "opslog.entry_post with no log accepting automatic entries; dropped",
            extra={"organisation_id": message.organisation_id},
        )
        return
    await service.add_automatic_entry(
        session,
        log=log,
        message_id=message.id,
        text=payload.text,
        occurred_at=payload.occurred_at,
        category_id=payload.category_id,
        location=payload.location,
        private=payload.private,
        record=(payload.record.kind, payload.record.id) if payload.record else None,
    )
