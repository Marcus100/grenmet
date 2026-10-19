"""Retention purge: boundaries, idempotence, batching."""

import uuid
from datetime import date, datetime, timedelta

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.contact.models import ContactDataRequest, ContactMessage
from src.feedback.models import PageFeedback
from src.subscriptions.models import ListSubscription, SubscriptionStatus
from src.worker import main, retention

NOW = datetime.fromisoformat("2026-10-18T12:00:00")


def test_months_before_handles_year_wrap_and_short_months() -> None:
    assert retention.months_before(NOW, 24) == datetime.fromisoformat(
        "2024-10-18T12:00:00"
    )
    assert retention.months_before(
        datetime.fromisoformat("2026-03-31T00:00:00"), 1
    ) == datetime.fromisoformat("2026-02-28T00:00:00")
    assert retention.months_before(
        datetime.fromisoformat("2028-02-29T00:00:00"), 12
    ) == datetime.fromisoformat("2027-02-28T00:00:00")
    assert retention.months_before(
        datetime.fromisoformat("2026-01-15T00:00:00"), 2
    ) == datetime.fromisoformat("2025-11-15T00:00:00")


def test_purge_job_is_registered_and_scheduled_daily() -> None:
    assert main.purge_expired_data in main.WorkerSettings.functions
    jobs = [
        job
        for job in main.WorkerSettings.cron_jobs
        if job.coroutine is main.purge_expired_data
    ]
    assert len(jobs) == 1
    assert jobs[0].hour == 3
    assert jobs[0].minute == 30


def _tag() -> str:
    return uuid.uuid4().hex[:10]


def _message(tag: str, created_at: datetime) -> ContactMessage:
    return ContactMessage(
        site="mbia",
        name=f"n-{tag}",
        email=f"{tag}@example.com",
        subject=tag,
        message="hello",
        created_at=created_at,
    )


def _data_request(tag: str, created_at: datetime) -> ContactDataRequest:
    return ContactDataRequest(
        site="gms",
        name=f"n-{tag}",
        email=f"{tag}@example.com",
        organisation="org",
        purpose="p",
        parameters=["rain"],
        stations="all",
        period_start=date(2020, 1, 1),
        period_end=date(2020, 2, 1),
        data_format="csv",
        intended_use="research",
        consent_at=created_at,
        created_at=created_at,
    )


async def _message_exists(db: AsyncSession, subject: str) -> bool:
    count = await db.scalar(
        select(func.count())
        .select_from(ContactMessage)
        .where(ContactMessage.subject == subject)
    )
    return bool(count)


async def _request_exists(db: AsyncSession, name: str) -> bool:
    count = await db.scalar(
        select(func.count())
        .select_from(ContactDataRequest)
        .where(ContactDataRequest.name == name)
    )
    return bool(count)


async def test_contact_rows_are_deleted_only_after_24_months(
    db_async: AsyncSession,
) -> None:
    tag = _tag()
    cutoff = retention.months_before(NOW, 24)
    old, edge, fresh = f"old{tag}", f"edge{tag}", f"new{tag}"
    db_async.add_all(
        [
            _message(old, cutoff - timedelta(seconds=1)),
            _message(edge, cutoff),
            _message(fresh, NOW),
            _data_request(old, cutoff - timedelta(seconds=1)),
            _data_request(fresh, cutoff + timedelta(days=1)),
        ]
    )
    await db_async.commit()

    first = await retention.purge_expired(session=db_async, now=NOW)
    assert first.contact_messages >= 1
    assert first.data_requests >= 1
    assert not await _message_exists(db_async, old)
    assert await _message_exists(db_async, edge)
    assert await _message_exists(db_async, fresh)
    assert not await _request_exists(db_async, f"n-{old}")
    assert await _request_exists(db_async, f"n-{fresh}")

    again = await retention.purge_expired(session=db_async, now=NOW)  # idempotent
    assert again.contact_messages == 0
    assert again.data_requests == 0
    assert await _message_exists(db_async, edge)


async def test_only_stale_pending_subscriptions_are_deleted(
    db_async: AsyncSession,
) -> None:
    tag = _tag()
    stale = NOW - timedelta(days=30, seconds=1)
    boundary = NOW - timedelta(days=30)

    def sub(name: str, status: str, requested: datetime) -> ListSubscription:
        return ListSubscription(
            list_key="signal",
            email=f"{name}{tag}@example.com",
            email_hash=f"hash-{name}{tag}",
            status=status,
            requested_at=requested,
        )

    db_async.add_all(
        [
            sub("stalepending", SubscriptionStatus.PENDING.value, stale),
            sub("boundary", SubscriptionStatus.PENDING.value, boundary),
            sub("staleconfirmed", SubscriptionStatus.CONFIRMED.value, stale),
            sub("staleunsub", SubscriptionStatus.UNSUBSCRIBED.value, stale),
        ]
    )
    await db_async.commit()

    await retention.purge_expired(session=db_async, now=NOW)

    async def remains(name: str) -> bool:
        count = await db_async.scalar(
            select(func.count())
            .select_from(ListSubscription)
            .where(ListSubscription.email_hash == f"hash-{name}{tag}")
        )
        return bool(count)

    assert not await remains("stalepending")
    assert await remains("boundary")
    assert await remains("staleconfirmed")
    assert await remains("staleunsub")  # consent proof is kept


async def test_old_feedback_comments_are_nulled_but_counts_are_kept(
    db_async: AsyncSession,
) -> None:
    tag = _tag()
    cutoff = retention.months_before(NOW, 24)
    page = f"/p/{tag}"
    db_async.add_all(
        [
            PageFeedback(
                site="gms",
                page_path=page,
                helpful=True,
                comment="old comment",
                created_at=cutoff - timedelta(days=1),
            ),
            PageFeedback(
                site="gms",
                page_path=page,
                helpful=False,
                comment="new comment",
                created_at=cutoff + timedelta(days=1),
            ),
        ]
    )
    await db_async.commit()

    await retention.purge_expired(session=db_async, now=NOW)
    db_async.expire_all()
    rows = (
        await db_async.scalars(
            select(PageFeedback)
            .where(PageFeedback.page_path == page)
            .order_by(PageFeedback.created_at)
        )
    ).all()
    assert [row.comment for row in rows] == [None, "new comment"]
    assert [row.helpful for row in rows] == [True, False]


async def test_purge_runs_in_batches(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(retention, "BATCH_SIZE", 2)
    tag = _tag()
    old = retention.months_before(NOW, 24) - timedelta(days=1)
    db_async.add_all([_message(f"b{i}{tag}", old) for i in range(5)])
    await db_async.commit()

    result = await retention.purge_expired(session=db_async, now=NOW)
    assert result.contact_messages >= 5
    left = await db_async.scalar(
        select(func.count())
        .select_from(ContactMessage)
        .where(ContactMessage.subject.like(f"b%{tag}"))
    )
    assert left == 0
