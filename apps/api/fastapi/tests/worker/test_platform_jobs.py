"""Outbox and reminder jobs are scheduled; retention purges the new tables."""

import uuid
from datetime import datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.bookings import reminders
from src.bookings.models import Booking, Customer, Provider, Service
from src.contacts import service as contacts_service
from src.idempotency import IdempotencyKey, hash_request
from src.outbox import Outbox, OutboxStatus
from src.worker import main, retention
from tests.organisations.support import make_org

NOW = datetime.fromisoformat("2026-10-20T12:00:00")


@pytest.mark.parametrize("job", [main.drain_outbox, main.enqueue_booking_reminders])
def test_jobs_are_registered_and_scheduled(job: object) -> None:
    assert job in main.WorkerSettings.functions
    assert sum(1 for c in main.WorkerSettings.cron_jobs if c.coroutine is job) == 1


async def test_drain_outbox_job_records_metrics_and_returns_a_count(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src import operational_metrics

    recorded: list[tuple[str, bool]] = []

    async def record(_: object, name: str, __: str, success: bool) -> None:
        recorded.append((name, success))

    async def drained(_: object) -> int:
        return 3

    monkeypatch.setattr(operational_metrics, "record_job", record)
    monkeypatch.setattr(outbox, "drain", drained)
    assert await main.drain_outbox({"job_id": "t"}) == 3
    assert recorded == [("drain_outbox", True)]

    async def broken(_: object) -> int:
        raise RuntimeError

    monkeypatch.setattr(outbox, "drain", broken)
    with pytest.raises(RuntimeError):
        await main.drain_outbox({"job_id": "t"})
    assert recorded[-1] == ("drain_outbox", False)


async def test_booking_reminder_job_records_metrics(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from src import operational_metrics

    recorded: list[tuple[str, bool]] = []

    async def record(_: object, name: str, __: str, success: bool) -> None:
        recorded.append((name, success))

    async def queued(_: object) -> int:
        return 2

    monkeypatch.setattr(operational_metrics, "record_job", record)
    monkeypatch.setattr(reminders, "enqueue_due_reminders", queued)
    assert await main.enqueue_booking_reminders({"job_id": "t"}) == 2
    assert recorded == [("enqueue_booking_reminders", True)]


async def _booking(db: AsyncSession, org_id: str, ends_at: datetime) -> Booking:
    service = Service(organisation_id=org_id, name="S", duration_min=60)
    provider = Provider(organisation_id=org_id, name="P")
    contact = await contacts_service.create_without_email(
        db, org_id, name="C", source="test"
    )
    customer = Customer(organisation_id=org_id, contact_id=contact.id)
    db.add_all([service, provider, customer])
    await db.flush()
    booking = Booking(
        organisation_id=org_id,
        provider_id=provider.id,
        service_id=service.id,
        customer_id=customer.id,
        starts_at=ends_at - timedelta(hours=1),
        ends_at=ends_at,
        blocked_from=ends_at - timedelta(hours=1),
        blocked_until=ends_at,
        status="completed",
        currency="XCD",
        manage_token_hash=uuid.uuid4().hex + uuid.uuid4().hex,
    )
    db.add(booking)
    await db.flush()
    return booking


def _outbox(org_id: str, status: OutboxStatus, updated_at: datetime) -> Outbox:
    return Outbox(
        organisation_id=org_id,
        topic="test.retention",
        dedupe_key=uuid.uuid4().hex,
        payload={"to_email": "x@example.com"},
        status=status.value,
        updated_at=updated_at,
        created_at=updated_at,
    )


def _key(org_id: str, expires_at: datetime) -> IdempotencyKey:
    return IdempotencyKey(
        scope="test",
        organisation_id=org_id,
        key=uuid.uuid4().hex,
        request_hash=hash_request({}),
        status_code=201,
        response={"manage_token": "t"},
        expires_at=expires_at,
    )


async def test_purge_removes_expired_keys_old_outbox_rows_and_old_tokens(
    db_async: AsyncSession,
) -> None:
    org = (await make_org(db_async, f"Purge {uuid.uuid4().hex[:6]}")).id
    expired, live = (
        _key(org, NOW - timedelta(minutes=1)),
        _key(org, NOW + timedelta(hours=1)),
    )
    old_done = _outbox(org, OutboxStatus.DONE, NOW - timedelta(days=31))
    old_dead = _outbox(org, OutboxStatus.DEAD, NOW - timedelta(days=31))
    new_done = _outbox(org, OutboxStatus.DONE, NOW - timedelta(days=29))
    old_pending = _outbox(org, OutboxStatus.PENDING, NOW - timedelta(days=60))
    stale = await _booking(db_async, org, NOW - timedelta(days=91))
    recent = await _booking(db_async, org, NOW - timedelta(days=89))
    db_async.add_all([expired, live, old_done, old_dead, new_done, old_pending])
    await db_async.commit()
    ids = {
        "expired": expired.id,
        "live": live.id,
        "old_done": old_done.id,
        "old_dead": old_dead.id,
        "new_done": new_done.id,
        "old_pending": old_pending.id,
    }
    stale_id, recent_id = stale.id, recent.id

    result = await retention.purge_expired(session=db_async, now=NOW)
    assert result.idempotency_keys >= 1
    assert result.outbox_rows >= 2
    assert result.booking_tokens >= 1
    assert result.total >= 4

    db_async.expire_all()
    keys = set(
        await db_async.scalars(
            select(IdempotencyKey.id).where(IdempotencyKey.organisation_id == org)
        )
    )
    assert keys == {ids["live"]}
    rows = set(
        await db_async.scalars(select(Outbox.id).where(Outbox.organisation_id == org))
    )
    assert rows == {ids["new_done"], ids["old_pending"]}
    tokens = dict(
        (
            await db_async.execute(
                select(Booking.id, Booking.manage_token_hash).where(
                    Booking.organisation_id == org
                )
            )
        ).all()
    )
    assert tokens[stale_id] is None
    assert tokens[recent_id] is not None

    again = await retention.purge_expired(session=db_async, now=NOW)
    assert again.idempotency_keys == again.outbox_rows == 0
    assert again.booking_tokens == 0


def test_purge_result_total_includes_the_new_counters() -> None:
    result = retention.PurgeResult(idempotency_keys=1, outbox_rows=2, booking_tokens=3)
    assert result.total == 6
