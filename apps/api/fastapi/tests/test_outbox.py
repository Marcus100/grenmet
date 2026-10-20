"""Platform outbox: enqueue, drain, backoff, dead letters, the email.send topic."""

import uuid
from datetime import timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src import email as email_module
from src import outbox
from src.email_config import email_settings
from src.notifications import outbox_handlers
from src.notifications.models import OutboundEmail
from src.outbox import Outbox, OutboxMessage, OutboxStatus
from src.utils.datetime import utc_now


def _topic() -> str:
    return f"test.{uuid.uuid4().hex[:12]}"


async def _row(db: AsyncSession, row_id: uuid.UUID) -> Outbox:
    row = await db.scalar(
        select(Outbox)
        .where(Outbox.id == row_id)
        .execution_options(populate_existing=True)
    )
    assert row is not None
    return row


async def _enqueue(
    db: AsyncSession, topic: str, key: str = "k", **payload: object
) -> uuid.UUID:
    assert await outbox.enqueue(db, topic=topic, dedupe_key=key, payload=payload)
    await db.commit()
    row_id = await db.scalar(
        select(Outbox.id).where(Outbox.topic == topic, Outbox.dedupe_key == key)
    )
    assert row_id is not None
    return row_id


def test_retry_delay_doubles_from_one_minute_to_one_hour() -> None:
    assert [outbox.retry_delay_seconds(n) for n in range(1, 8)] == [
        60,
        120,
        240,
        480,
        960,
        1920,
        3600,
    ]


async def test_enqueue_dedupes_per_topic(db_async: AsyncSession) -> None:
    topic = _topic()
    assert await outbox.enqueue(db_async, topic=topic, dedupe_key="a", payload={})
    assert not await outbox.enqueue(db_async, topic=topic, dedupe_key="a", payload={})
    assert await outbox.enqueue(
        db_async, topic=f"{topic}.b", dedupe_key="a", payload={}
    )
    await db_async.commit()
    count = await db_async.scalar(
        select(func.count()).select_from(Outbox).where(Outbox.topic.like(f"{topic}%"))
    )
    assert count == 2


async def test_handler_runs_once_and_payload_is_cleared(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    topic = _topic()
    seen: list[OutboxMessage] = []

    async def handle(_: AsyncSession, message: OutboxMessage) -> None:
        seen.append(message)

    monkeypatch.setitem(outbox._HANDLERS, topic, handle)
    row_id = await _enqueue(db_async, topic, to="someone@example.com")
    await outbox.drain(db_async, only_topics=[topic])
    await outbox.drain(db_async, only_topics=[topic])
    assert [m.payload for m in seen] == [{"to": "someone@example.com"}]
    row = await _row(db_async, row_id)
    assert row.status == OutboxStatus.DONE.value
    assert row.payload == {}
    assert row.last_error is None


async def test_failure_backs_off_then_goes_dead_after_five_attempts(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    topic = _topic()
    calls = 0

    async def failing(_: AsyncSession, __: OutboxMessage) -> None:
        nonlocal calls
        calls += 1
        raise RuntimeError("secret-person@example.com bounced")

    monkeypatch.setitem(outbox._HANDLERS, topic, failing)
    row_id = await _enqueue(db_async, topic)
    moment = utc_now() + timedelta(seconds=1)
    for attempt, delay in enumerate((60, 120, 240, 480), start=1):
        await outbox.drain(db_async, now=moment, only_topics=[topic])
        row = await _row(db_async, row_id)
        assert row.attempts == attempt
        assert row.status == OutboxStatus.PENDING.value
        assert row.next_attempt_at == moment + timedelta(seconds=delay)
        # Not due yet: another run leaves it alone.
        await outbox.drain(
            db_async, now=moment + timedelta(seconds=delay - 1), only_topics=[topic]
        )
        assert calls == attempt
        moment += timedelta(seconds=delay + 1)
    await outbox.drain(db_async, now=moment, only_topics=[topic])
    row = await _row(db_async, row_id)
    assert (row.status, row.attempts, calls) == (OutboxStatus.DEAD.value, 5, 5)
    # Only the exception type is kept: messages can quote personal data.
    assert row.last_error == "RuntimeError"
    await outbox.drain(db_async, now=moment + timedelta(days=1), only_topics=[topic])
    assert calls == 5


async def test_failed_handler_leaves_none_of_its_writes(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    topic = _topic()
    address = f"{uuid.uuid4().hex[:8]}@example.com"

    async def half_done(session: AsyncSession, __: OutboxMessage) -> None:
        session.add(OutboundEmail(to_email=address, subject="x", transactional=True))
        await session.flush()
        raise RuntimeError("after the write")

    monkeypatch.setitem(outbox._HANDLERS, topic, half_done)
    await _enqueue(db_async, topic)
    await outbox.drain(db_async, only_topics=[topic])
    assert (
        await db_async.scalar(
            select(func.count())
            .select_from(OutboundEmail)
            .where(OutboundEmail.to_email == address)
        )
        == 0
    )


async def test_rows_without_a_registered_handler_are_left_pending(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    known, unknown = _topic(), _topic()

    async def handle(_: AsyncSession, __: OutboxMessage) -> None:
        return None

    monkeypatch.setitem(outbox._HANDLERS, known, handle)
    row_id = await _enqueue(db_async, unknown)
    await outbox.drain(
        db_async, now=utc_now() + timedelta(hours=1), only_topics=[known, unknown]
    )
    row = await _row(db_async, row_id)
    assert (row.status, row.attempts) == (OutboxStatus.PENDING.value, 0)


async def test_email_send_handler_logs_one_outbound_email(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)
    monkeypatch.setattr(email_module, "send_email", lambda **_: None)
    address = f"{uuid.uuid4().hex[:8]}@example.com"
    key = f"t:{uuid.uuid4().hex}"
    args = {
        "to_email": address,
        "subject": "Hello",
        "html": "<p>Hi</p>",
        "transactional": True,
        "dedupe_key": key,
    }
    assert await outbox_handlers.enqueue_email(db_async, **args)
    assert not await outbox_handlers.enqueue_email(db_async, **args)
    await db_async.commit()
    queued = await db_async.scalar(
        select(Outbox).where(
            Outbox.topic == outbox_handlers.EMAIL_SEND, Outbox.dedupe_key == key
        )
    )
    assert queued is not None
    assert queued.status == OutboxStatus.PENDING.value

    # Run the real handler through the runner on a private topic, so this test
    # never drains other tests' email.send rows.
    topic = _topic()
    monkeypatch.setitem(outbox._HANDLERS, topic, outbox_handlers.send_email)
    await outbox.enqueue(db_async, topic=topic, dedupe_key=key, payload=queued.payload)
    await db_async.commit()
    await outbox.drain(db_async, only_topics=[topic])
    await outbox.drain(db_async, only_topics=[topic])
    emails = list(
        await db_async.scalars(
            select(OutboundEmail).where(OutboundEmail.to_email == address)
        )
    )
    assert len(emails) == 1
    # A delivery-log row: the body is gone once the mail is final.
    assert (emails[0].subject, emails[0].html, emails[0].transactional) == (
        "Hello",
        None,
        True,
    )
    assert emails[0].status == "sent"
    done = await db_async.scalar(
        select(Outbox).where(Outbox.topic == topic, Outbox.dedupe_key == key)
    )
    assert done is not None
    assert done.status == OutboxStatus.DONE.value
    assert done.payload == {}


async def test_email_needs_a_body(db_async: AsyncSession) -> None:
    with pytest.raises(ValueError):
        await outbox_handlers.enqueue_email(
            db_async,
            to_email="a@example.com",
            subject="x",
            transactional=True,
            dedupe_key="none",
        )
