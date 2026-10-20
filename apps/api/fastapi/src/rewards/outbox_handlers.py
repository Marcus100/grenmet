"""Outbox topic owned by rewards (ADR-0026, ADR-0030).

``rewards.qualifying_action`` credits a real-world action through
``service.record_qualifying_action``. Producers call
``service.emit_qualifying_action`` inside the transaction that causes the action;
the handler runs once with the row's ``done`` status and is idempotent anyway
(a replay credits nothing). Payload keys: ``source_type``, ``source_id``,
``organisation_id``, ``user_id``. The payload holds a person's id: nothing here
logs it.

Import this module (the worker does at startup) to register the handler.
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.auth.models import User

from . import service

TOPIC = service.QUALIFYING_ACTION_TOPIC


@outbox.handler(TOPIC)
async def record_qualifying_action(
    session: AsyncSession, message: outbox.OutboxMessage
) -> None:
    payload = message.payload
    user_id = uuid.UUID(str(payload["user_id"]))
    if await session.get(User, user_id) is None:
        # The account was deleted since the action: nothing to credit.
        return
    await service.record_qualifying_action(
        session,
        source_type=payload["source_type"],
        source_id=payload["source_id"],
        organisation_id=payload["organisation_id"],
        user_id=user_id,
    )
    await session.flush()
