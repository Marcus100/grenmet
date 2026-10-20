"""Outbox backlog gauges and the platform dead-letter signal (Events: tests/events)."""

import logging
import uuid
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src import operational_metrics, outbox
from src.outbox import Outbox, OutboxMessage, OutboxStatus
from src.utils.datetime import utc_now
from src.worker import main, outbox_health

BOUNDS = {"stale_after": timedelta(minutes=30), "dead_window": timedelta(hours=24)}


def _topic() -> str:
    return f"test.{uuid.uuid4().hex[:12]}"


async def test_platform_dead_letter_logs_a_stable_signal_and_counts(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    caplog: pytest.LogCaptureFixture,
) -> None:
    topic = _topic()
    counted: list[tuple[str, str]] = []

    async def failing(_: AsyncSession, __: OutboxMessage) -> None:
        raise RuntimeError("secret-person@example.com bounced")

    async def record(name: str, value: str) -> None:
        counted.append((name, value))

    monkeypatch.setitem(outbox._HANDLERS, topic, failing)
    monkeypatch.setattr(operational_metrics, "record_outbox_dead", record)
    # Alembic's fileConfig disables existing loggers during database bootstrap.
    monkeypatch.setattr(operational_metrics.logger, "disabled", False)
    assert await outbox.enqueue(
        db_async, topic=topic, dedupe_key="k", payload={"to": "secret@example.com"}
    )
    await db_async.commit()
    # One attempt from dead: the next failure dead-letters the row.
    await db_async.execute(
        update(Outbox)
        .where(Outbox.topic == topic)
        .values(attempts=outbox.MAX_ATTEMPTS - 1)
    )
    await db_async.commit()
    with caplog.at_level(logging.ERROR, logger="src.operational_metrics"):
        await outbox.drain(db_async, only_topics=[topic])
    assert counted == [("platform", topic)]
    (record_,) = [
        r
        for r in caplog.records
        if r.message == operational_metrics.DEAD_LETTER_MESSAGE
    ]
    assert record_.levelno == logging.ERROR
    assert (record_.outbox, record_.topic, record_.attempts) == (
        "platform",
        topic,
        outbox.MAX_ATTEMPTS,
    )
    # No payload or exception text reaches the signal.
    assert "secret" not in str(record_.__dict__)


async def test_platform_backlog_counts_recent_dead_and_overdue_pending(
    db_async: AsyncSession,
) -> None:
    topic = _topic()
    now = utc_now()
    for key, status, due, updated in [
        ("dead-recent", OutboxStatus.DEAD, now, now - timedelta(hours=1)),
        ("dead-old", OutboxStatus.DEAD, now, now - timedelta(days=3)),
        ("overdue", OutboxStatus.PENDING, now - timedelta(hours=1), now),
        ("due-now", OutboxStatus.PENDING, now - timedelta(minutes=5), now),
        ("scheduled", OutboxStatus.PENDING, now + timedelta(days=1), now),
        ("done", OutboxStatus.DONE, now - timedelta(days=1), now),
    ]:
        db_async.add(
            Outbox(
                topic=topic,
                dedupe_key=key,
                payload={},
                status=status.value,
                next_attempt_at=due,
                created_at=now - timedelta(days=2),
                updated_at=updated,
            )
        )
    await db_async.commit()
    backlog = await outbox_health.platform_backlog(
        db_async, **BOUNDS, now=now, only_topics=[topic]
    )
    assert backlog == outbox_health.Backlog("platform", dead=1, stale_pending=1)


async def test_report_records_gauges_and_warns_only_above_threshold(
    monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    gauges: list[dict[str, Any]] = []

    async def record(_redis: object, name: str, **counts: int) -> None:
        gauges.append({"outbox": name, **counts})

    monkeypatch.setattr(operational_metrics, "record_outbox_backlog", record)
    monkeypatch.setattr(outbox_health.logger, "disabled", False)
    quiet = outbox_health.Backlog("platform", dead=1, stale_pending=0)
    with caplog.at_level(logging.WARNING, logger="src.worker.outbox_health"):
        assert await outbox_health.report(None, quiet, threshold=1)
        assert not caplog.records
        loud = outbox_health.Backlog("events", dead=0, stale_pending=2)
        assert not await outbox_health.report(None, loud, threshold=1)
    assert [r.message for r in caplog.records] == [outbox_health.BACKLOG_WARNING]
    assert caplog.records[0].outbox == "events"
    assert gauges == [
        {"outbox": "platform", "dead": 1, "stale_pending": 0},
        {"outbox": "events", "dead": 0, "stale_pending": 2},
    ]


def test_backlog_job_is_registered_and_scheduled() -> None:
    assert main.check_outbox_backlog in main.WorkerSettings.functions
    scheduled = {job.coroutine for job in main.WorkerSettings.cron_jobs}
    assert main.check_outbox_backlog in scheduled


async def test_backlog_job_checks_platform_without_an_events_database(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src.events import database

    reported: list[str] = []

    async def report(_redis: object, backlog: Any, *, threshold: int) -> bool:
        reported.append(backlog.outbox)
        return threshold >= 0

    monkeypatch.setattr(database, "create_session", lambda: None)
    monkeypatch.setattr(outbox_health, "report", report)
    assert await main.check_outbox_backlog({}) == 0
    assert reported == ["platform"]
