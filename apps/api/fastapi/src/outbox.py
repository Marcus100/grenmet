"""Generic transactional outbox and runner (ADR-0026).

A domain writes a side effect with ``enqueue`` inside the transaction that causes
it, so the row commits or rolls back with the change. The ARQ job
``drain_outbox`` calls ``drain``, which runs the handler registered for each due
row's topic::

    @outbox.handler("email.send")
    async def send_email(session, message): ...

Delivery is at-least-once, one row per transaction: the handler's own writes and
the row's ``done`` status commit together, so a handler that only writes to the
main database runs exactly once. Handlers that touch anything else must be
idempotent. A failure backs off 1 minute doubling to 1 hour and the row is
``dead`` after ``MAX_ATTEMPTS`` failures. Payloads may hold personal data: a
finished (``done``) row's payload is cleared, ``src.worker.retention`` deletes
done and dead rows after 30 days, and nothing here logs payloads.

Rows whose topic has no registered handler are left alone, so a worker older than
the API never kills a message it cannot yet read.
"""

import logging
import uuid
from collections.abc import Awaitable, Callable, Collection
from dataclasses import dataclass
from datetime import datetime, timedelta
from enum import Enum
from typing import Any

import sqlalchemy as sa
from sqlalchemy import ForeignKey, String, select
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.dialects.postgresql import insert as pg_insert
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Mapped, mapped_column

from src.orm import Base
from src.utils.datetime import utc_now

logger = logging.getLogger(__name__)

MAX_ATTEMPTS = 5
BATCH_SIZE = 50
_RETRY_BASE_SECONDS = 60
_RETRY_MAX_SECONDS = 3600


class OutboxStatus(str, Enum):
    PENDING = "pending"
    DONE = "done"
    DEAD = "dead"


class Outbox(Base):
    __tablename__ = "outbox"
    __table_args__ = (
        sa.UniqueConstraint("topic", "dedupe_key", name="outbox_topic_dedupe_key_key"),
        sa.CheckConstraint("status IN ('pending', 'done', 'dead')", name="status"),
        sa.Index("outbox_due_idx", "status", "next_attempt_at"),
        {"schema": "platform"},
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organisation_id: Mapped[str | None] = mapped_column(
        String(100), ForeignKey("org.organisation.id", ondelete="SET NULL")
    )
    topic: Mapped[str] = mapped_column(String(80))
    payload: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict)
    dedupe_key: Mapped[str] = mapped_column(String(200))
    attempts: Mapped[int] = mapped_column(default=0)
    next_attempt_at: Mapped[datetime] = mapped_column(default=utc_now)
    status: Mapped[str] = mapped_column(String(10), default=OutboxStatus.PENDING.value)
    last_error: Mapped[str | None] = mapped_column(String(300))
    created_at: Mapped[datetime] = mapped_column(default=utc_now)
    updated_at: Mapped[datetime] = mapped_column(default=utc_now, onupdate=utc_now)


@dataclass(frozen=True)
class OutboxMessage:
    """What a handler receives. Treat ``payload`` as personal data."""

    id: uuid.UUID
    organisation_id: str | None
    topic: str
    payload: dict[str, Any]
    dedupe_key: str
    attempts: int


Handler = Callable[[AsyncSession, OutboxMessage], Awaitable[None]]

_HANDLERS: dict[str, Handler] = {}


def handler(topic: str) -> Callable[[Handler], Handler]:
    """Register the function that performs ``topic``'s side effect."""

    def register(function: Handler) -> Handler:
        if topic in _HANDLERS and _HANDLERS[topic] is not function:
            raise ValueError(f"Outbox topic already has a handler: {topic}")
        _HANDLERS[topic] = function
        return function

    return register


def registered_topics() -> list[str]:
    return sorted(_HANDLERS)


def retry_delay_seconds(attempts: int) -> int:
    """Delay after the ``attempts``-th failure: 60 s, 120 s, ... capped at 1 h."""
    return min(_RETRY_BASE_SECONDS << max(attempts - 1, 0), _RETRY_MAX_SECONDS)


async def enqueue(
    session: AsyncSession,
    *,
    topic: str,
    payload: dict[str, Any],
    dedupe_key: str,
    organisation_id: str | None = None,
    run_at: datetime | None = None,
) -> bool:
    """Add a row to the caller's transaction (no commit).

    A repeated ``(topic, dedupe_key)`` is ignored; returns True when a row was
    added."""
    now = utc_now()
    result = await session.execute(
        pg_insert(Outbox)
        .values(
            id=uuid.uuid4(),
            organisation_id=organisation_id,
            topic=topic,
            payload=payload,
            dedupe_key=dedupe_key[:200],
            attempts=0,
            next_attempt_at=run_at or now,
            status=OutboxStatus.PENDING.value,
            created_at=now,
            updated_at=now,
        )
        .on_conflict_do_nothing(index_elements=["topic", "dedupe_key"])
    )
    return bool(getattr(result, "rowcount", 0))


async def drain(
    session: AsyncSession,
    *,
    limit: int = BATCH_SIZE,
    now: datetime | None = None,
    only_topics: Collection[str] | None = None,
) -> int:
    """Run handlers for due rows, one transaction per row. Returns rows finished.

    ``now`` and ``only_topics`` exist for tests: ``now`` decides which rows are due
    and when a failed row is next tried; ``only_topics`` keeps a test from running
    other tests' rows."""
    moment = now or utc_now()
    topics = [
        topic
        for topic in registered_topics()
        if only_topics is None or topic in only_topics
    ]
    if not topics:
        return 0
    finished = 0
    for _ in range(limit):
        row = await session.scalar(
            select(Outbox)
            .where(
                Outbox.status == OutboxStatus.PENDING.value,
                Outbox.next_attempt_at <= moment,
                Outbox.topic.in_(topics),
            )
            .order_by(Outbox.next_attempt_at, Outbox.created_at)
            .limit(1)
            .with_for_update(skip_locked=True)
        )
        if row is None:
            break
        message = OutboxMessage(
            id=row.id,
            organisation_id=row.organisation_id,
            topic=row.topic,
            payload=dict(row.payload),
            dedupe_key=row.dedupe_key,
            attempts=row.attempts,
        )
        try:
            await _HANDLERS[row.topic](session, message)
        except Exception as exc:  # noqa: BLE001 - handlers are arbitrary; any failure retries
            await session.rollback()
            await _record_failure(session, message, exc, moment)
        else:
            row.status = OutboxStatus.DONE.value
            row.attempts += 1
            row.last_error = None
            row.payload = {}
            row.updated_at = moment
            finished += 1
            await session.commit()
    return finished


async def _record_failure(
    session: AsyncSession, message: OutboxMessage, error: Exception, moment: datetime
) -> None:
    row = await session.scalar(
        select(Outbox)
        .where(Outbox.id == message.id, Outbox.status == OutboxStatus.PENDING.value)
        .with_for_update(skip_locked=True)
    )
    if row is None:
        await session.rollback()
        return
    row.attempts += 1
    # The exception type only: messages can quote the payload's personal data.
    row.last_error = type(error).__name__
    row.updated_at = moment
    if row.attempts >= MAX_ATTEMPTS:
        row.status = OutboxStatus.DEAD.value
        logger.error(
            "Outbox message is dead",
            extra={"outbox_id": str(row.id), "topic": row.topic},
        )
    else:
        row.next_attempt_at = moment + timedelta(
            seconds=retry_delay_seconds(row.attempts)
        )
        logger.warning(
            "Outbox handler failed; will retry",
            extra={
                "outbox_id": str(row.id),
                "topic": row.topic,
                "attempts": row.attempts,
            },
        )
    await session.commit()
