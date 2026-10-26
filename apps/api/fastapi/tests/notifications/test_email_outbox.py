"""Email on the platform outbox (N4a, ADR-0026).

Real ``outbox.drain`` runs on private topics bound to the real handlers, so these
tests never send other tests' queued mail.
"""

import uuid
from collections.abc import Callable
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src import email as email_module
from src import outbox
from src.email_config import email_settings
from src.notifications import dispatch, outbox_handlers
from src.notifications import service as notification_service
from src.notifications.models import (
    OutboundEmail,
    OutboundEmailStatus,
    SuppressionReason,
)
from src.outbox import Outbox, OutboxStatus
from src.utils.datetime import utc_now
from src.worker import retention


def _address() -> str:
    return f"mail-{uuid.uuid4().hex[:10]}@example.com"


@pytest.fixture
def configured(
    monkeypatch: pytest.MonkeyPatch,
    outbound_email_calls: list[dict[str, str]],
) -> list[dict[str, str]]:
    """Enable outbound delivery in tests; sends are captured by the shared stub."""
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)
    return outbound_email_calls


def _fail_sends(monkeypatch: pytest.MonkeyPatch, calls: list[int]) -> None:
    def failing(**_: Any) -> None:
        calls.append(1)
        raise RuntimeError("provider rejected someone@example.com")

    monkeypatch.setattr(email_module, "send_email", failing)


def _bind(monkeypatch: pytest.MonkeyPatch, topic: str, kind: str) -> None:
    handlers = {
        "deliver": (
            outbox_handlers.deliver_email,
            outbox_handlers._email_deliver_dead,
        ),
        "send": (outbox_handlers.send_email, outbox_handlers._email_send_dead),
    }
    handle, dead = handlers[kind]
    monkeypatch.setitem(outbox._HANDLERS, topic, handle)
    monkeypatch.setitem(outbox._DEAD_HANDLERS, topic, dead)


async def _private_topic(
    db: AsyncSession, monkeypatch: pytest.MonkeyPatch, row: OutboundEmail
) -> str:
    """Move ``row``'s email.deliver outbox row to a private topic with the real handler."""
    topic = f"test.{uuid.uuid4().hex[:12]}"
    _bind(monkeypatch, topic, "deliver")
    await db.execute(
        update(Outbox)
        .where(
            Outbox.topic == notification_service.EMAIL_DELIVER,
            Outbox.dedupe_key == str(row.id),
        )
        .values(topic=topic)
    )
    await db.commit()
    return topic


async def _outbox_row(db: AsyncSession, topic: str) -> Outbox:
    found = await db.scalar(
        select(Outbox)
        .where(Outbox.topic == topic)
        .execution_options(populate_existing=True)
    )
    assert found is not None
    return found


async def _email(db: AsyncSession, row_id: uuid.UUID) -> OutboundEmail:
    found = await db.scalar(
        select(OutboundEmail)
        .where(OutboundEmail.id == row_id)
        .execution_options(populate_existing=True)
    )
    assert found is not None
    return found


async def _queue(
    db: AsyncSession,
    *,
    transactional: bool = True,
    address: str | None = None,
) -> OutboundEmail:
    row = notification_service.enqueue_email(
        session=db,
        to_email=address or _address(),
        subject="Hello",
        transactional=transactional,
        template="subscription-confirm",
        props={
            "projectName": "Barrels Grenada",
            "listName": "Alerts",
            "confirmLink": "https://example.test/confirm?token=secret-token",
        },
    )
    await db.commit()
    return row


async def test_enqueue_writes_one_outbox_row_without_personal_data(
    db_async: AsyncSession,
) -> None:
    row = await _queue(db_async)
    queued = list(
        await db_async.scalars(
            select(Outbox).where(
                Outbox.topic == notification_service.EMAIL_DELIVER,
                Outbox.dedupe_key == str(row.id),
            )
        )
    )
    assert len(queued) == 1
    assert queued[0].status == OutboxStatus.PENDING.value
    assert queued[0].payload == {"outbound_email_id": str(row.id)}
    assert row.status == OutboundEmailStatus.PENDING.value


async def test_sent_once_then_content_and_payload_are_cleared(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    configured: list[dict[str, Any]],
) -> None:
    row = await _queue(db_async)
    topic = await _private_topic(db_async, monkeypatch, row)
    assert await outbox.drain(db_async, only_topics=[topic]) == 1
    assert await outbox.drain(db_async, only_topics=[topic]) == 0
    assert [m["email_to"] for m in configured] == [row.to_email]
    assert "secret-token" in configured[0]["html_content"]
    done = await _outbox_row(db_async, topic)
    assert (done.status, done.payload) == (OutboxStatus.DONE.value, {})
    mail = await _email(db_async, row.id)
    assert mail.status == OutboundEmailStatus.SENT.value
    assert mail.sent_at is not None
    assert (mail.props, mail.html) == ({}, None)


@pytest.mark.usefixtures("configured")
async def test_failures_back_off_then_dead_letter_the_email(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[int] = []
    _fail_sends(monkeypatch, calls)
    row = await _queue(db_async)
    email_id = row.id
    topic = await _private_topic(db_async, monkeypatch, row)
    moment = utc_now() + timedelta(seconds=1)
    for attempt, delay in enumerate((60, 120, 240, 480), start=1):
        await outbox.drain(db_async, now=moment, only_topics=[topic])
        pending = await _outbox_row(db_async, topic)
        assert (pending.status, pending.attempts) == (
            OutboxStatus.PENDING.value,
            attempt,
        )
        assert pending.next_attempt_at == moment + timedelta(seconds=delay)
        # Backing off: not retried before it is due, and still waiting to send.
        await outbox.drain(
            db_async, now=moment + timedelta(seconds=delay - 1), only_topics=[topic]
        )
        assert len(calls) == attempt
        assert (await _email(db_async, email_id)).status == "pending"
        moment += timedelta(seconds=delay + 1)
    await outbox.drain(db_async, now=moment, only_topics=[topic])
    dead = await _outbox_row(db_async, topic)
    assert (dead.status, dead.attempts, len(calls)) == (OutboxStatus.DEAD.value, 5, 5)
    assert dead.last_error == "RuntimeError"
    mail = await _email(db_async, email_id)
    assert mail.status == OutboundEmailStatus.FAILED.value
    assert mail.attempts == 5
    assert mail.last_error == "Delivery failed: RuntimeError"
    assert (mail.props, mail.html) == ({}, None)


@pytest.mark.usefixtures("configured")
async def test_a_transient_failure_then_success_sends_exactly_once(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    outbound_email_calls: list[dict[str, str]],
    stub_email_sender: Callable[..., None],
) -> None:
    row = await _queue(db_async)
    topic = await _private_topic(db_async, monkeypatch, row)
    calls: list[int] = []
    _fail_sends(monkeypatch, calls)
    moment = utc_now() + timedelta(seconds=1)
    await outbox.drain(db_async, now=moment, only_topics=[topic])
    monkeypatch.setattr(email_module, "send_email", stub_email_sender)
    later = moment + timedelta(seconds=61)
    await outbox.drain(db_async, now=later, only_topics=[topic])
    await outbox.drain(db_async, now=later + timedelta(days=1), only_topics=[topic])
    assert (len(calls), len(outbound_email_calls)) == (1, 1)
    assert (await _email(db_async, row.id)).status == OutboundEmailStatus.SENT.value
    assert (await _outbox_row(db_async, topic)).status == OutboxStatus.DONE.value


async def test_suppression_is_checked_at_send_time(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch, configured: list[Any]
) -> None:
    address = _address()
    marketing = await _queue(db_async, transactional=False, address=address)
    transactional = await _queue(db_async, transactional=True, address=address)
    # Suppressed after queueing: the send-time check still catches it.
    await notification_service.suppress_email(
        session=db_async,
        email=address,
        reason=SuppressionReason.COMPLAINT,
        source_event_id="evt",
    )
    await db_async.commit()
    for row in (marketing, transactional):
        topic = await _private_topic(db_async, monkeypatch, row)
        await outbox.drain(db_async, only_topics=[topic])
        assert (await _outbox_row(db_async, topic)).status == OutboxStatus.DONE.value
    skipped = await _email(db_async, marketing.id)
    assert skipped.status == OutboundEmailStatus.SKIPPED.value
    assert skipped.last_error == "Address is on the suppression list"
    assert (skipped.props, skipped.html) == ({}, None)
    assert (await _email(db_async, transactional.id)).status == "sent"
    assert [m["email_to"] for m in configured] == [address]


async def test_unconfigured_email_is_skipped_not_retried(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", None)
    row = await _queue(db_async)
    topic = await _private_topic(db_async, monkeypatch, row)
    await outbox.drain(db_async, only_topics=[topic])
    assert (await _email(db_async, row.id)).status == OutboundEmailStatus.SKIPPED.value
    assert (await _outbox_row(db_async, topic)).status == OutboxStatus.DONE.value


async def test_enqueue_email_once_sends_one_email_per_key(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch, configured: list[Any]
) -> None:
    address, key = _address(), f"cap-alert:{uuid.uuid4().hex}"
    args: dict[str, Any] = {
        "session": db_async,
        "to_email": address,
        "subject": "Alert",
        "dedupe_key": key,
        "template": "subscription-confirm",
        "props": {"projectName": "x", "listName": "y", "confirmLink": "https://e.test"},
    }
    assert await notification_service.enqueue_email_once(**args)
    assert not await notification_service.enqueue_email_once(**args)
    await db_async.commit()
    rows = list(
        await db_async.scalars(
            select(OutboundEmail).where(OutboundEmail.dedupe_key == key)
        )
    )
    assert len(rows) == 1
    topic = await _private_topic(db_async, monkeypatch, rows[0])
    await outbox.drain(db_async, only_topics=[topic])
    # Still deduplicated after the mail went out.
    assert not await notification_service.enqueue_email_once(**args)
    assert len(configured) == 1


async def test_dedupe_covers_rows_queued_before_the_outbox_move(
    db_async: AsyncSession,
) -> None:
    key = f"cap-alert:{uuid.uuid4().hex}"
    legacy = OutboundEmail(
        id=uuid.uuid4(),
        to_email=_address(),
        subject="Old",
        template="subscription-confirm",
        props={},
        dedupe_key=key,
    )
    db_async.add(legacy)
    await db_async.commit()
    assert not await notification_service.enqueue_email_once(
        session=db_async,
        to_email=_address(),
        subject="New",
        dedupe_key=key,
        template="subscription-confirm",
        props={},
    )
    await db_async.commit()
    assert (
        await db_async.scalar(
            select(Outbox.id).where(Outbox.dedupe_key == str(legacy.id))
        )
    ) is None


async def test_legacy_pending_rows_are_sent_once_by_the_legacy_drain_only(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch, configured: list[Any]
) -> None:
    address = _address()
    legacy = OutboundEmail(
        id=uuid.uuid4(),
        to_email=address,
        subject="Queued before the move",
        html="<p>legacy</p>",
        transactional=True,
    )
    db_async.add(legacy)
    await db_async.commit()
    new = await _queue(db_async, address=address)

    def subjects() -> list[str]:
        return [m["subject"] for m in configured if m["email_to"] == address]

    # The legacy drain sends the legacy row and leaves the outbox-backed one.
    await dispatch.process_outbound_emails(session=db_async, limit=10_000)
    await dispatch.process_outbound_emails(session=db_async, limit=10_000)
    assert subjects() == ["Queued before the move"]
    assert (await _email(db_async, legacy.id)).status == OutboundEmailStatus.SENT.value
    assert (await _email(db_async, new.id)).status == OutboundEmailStatus.PENDING.value

    # The outbox sends the new row; nothing is sent twice.
    new_topic = await _private_topic(db_async, monkeypatch, new)
    await outbox.drain(db_async, only_topics=[new_topic])
    await dispatch.process_outbound_emails(session=db_async, limit=10_000)
    assert subjects() == ["Queued before the move", "Hello"]


async def test_a_row_already_settled_is_not_sent_again(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch, configured: list[Any]
) -> None:
    row = await _queue(db_async)
    topic = await _private_topic(db_async, monkeypatch, row)
    await db_async.execute(
        update(OutboundEmail)
        .where(OutboundEmail.id == row.id)
        .values(status=OutboundEmailStatus.SENT.value)
    )
    await db_async.commit()
    await outbox.drain(db_async, only_topics=[topic])
    assert configured == []
    assert (await _outbox_row(db_async, topic)).status == OutboxStatus.DONE.value


async def test_email_send_topic_logs_once_and_clears_the_outbox_payload(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch, configured: list[Any]
) -> None:
    address, key = _address(), f"t:{uuid.uuid4().hex}"
    assert await outbox_handlers.enqueue_email(
        db_async,
        to_email=address,
        subject="Booked",
        html="<p>manage link</p>",
        transactional=True,
        dedupe_key=key,
    )
    await db_async.commit()
    topic = f"test.{uuid.uuid4().hex[:12]}"
    _bind(monkeypatch, topic, "send")
    await db_async.execute(
        update(Outbox)
        .where(Outbox.topic == outbox_handlers.EMAIL_SEND, Outbox.dedupe_key == key)
        .values(topic=topic)
    )
    await db_async.commit()
    await outbox.drain(db_async, only_topics=[topic])
    done = await _outbox_row(db_async, topic)
    assert (done.status, done.payload) == (OutboxStatus.DONE.value, {})
    logs = list(
        await db_async.scalars(
            select(OutboundEmail).where(OutboundEmail.to_email == address)
        )
    )
    assert [(m.status, m.html, m.props) for m in logs] == [("sent", None, {})]
    assert [m["email_to"] for m in configured] == [address]


@pytest.mark.usefixtures("configured")
async def test_email_send_topic_failure_retries_then_logs_a_failed_row(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    calls: list[int] = []
    _fail_sends(monkeypatch, calls)
    address = _address()
    topic = f"test.{uuid.uuid4().hex[:12]}"
    _bind(monkeypatch, topic, "send")
    await outbox.enqueue(
        db_async,
        topic=topic,
        dedupe_key="k",
        payload={
            "to_email": address,
            "subject": "Booked",
            "html": "<p>manage link</p>",
            "transactional": True,
        },
    )
    await db_async.commit()
    moment = utc_now() + timedelta(seconds=1)
    for _ in range(5):
        await outbox.drain(db_async, now=moment, only_topics=[topic])
        moment += timedelta(hours=2)
    assert len(calls) == 5
    assert (await _outbox_row(db_async, topic)).status == OutboxStatus.DEAD.value
    logs = list(
        await db_async.scalars(
            select(OutboundEmail).where(OutboundEmail.to_email == address)
        )
    )
    assert [(m.status, m.html, m.props, m.attempts) for m in logs] == [
        ("failed", None, {}, 5)
    ]


@pytest.mark.usefixtures("configured")
async def test_retention_purges_finished_email_outbox_rows(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    row = await _queue(db_async)
    topic = await _private_topic(db_async, monkeypatch, row)
    await outbox.drain(db_async, only_topics=[topic])
    finished = await _outbox_row(db_async, topic)
    await db_async.execute(
        update(Outbox)
        .where(Outbox.id == finished.id)
        .values(
            topic=notification_service.EMAIL_DELIVER,
            updated_at=utc_now() - timedelta(days=31),
        )
    )
    await db_async.commit()
    await retention.purge_expired(session=db_async)
    assert (
        await db_async.scalar(select(Outbox.id).where(Outbox.id == finished.id))
    ) is None
    # The delivery log keeps no body and is not purged by this change.
    assert (await _email(db_async, row.id)).status == OutboundEmailStatus.SENT.value
