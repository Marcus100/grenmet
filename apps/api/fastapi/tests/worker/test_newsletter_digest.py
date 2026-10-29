"""Daily newsletter fan-out (the 07:30 Grenada job). Test list only: no real sends."""

import uuid
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from urllib.parse import quote

import pytest
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.notifications import service as notification_service
from src.notifications.models import OutboundEmail, SuppressionReason
from src.outbox import Outbox
from src.subscriptions import newsletter, service
from src.subscriptions.config import subscriptions_settings
from src.subscriptions.constants import NEWSLETTER_LIST_KEY, NEWSLETTER_TEMPLATE
from src.subscriptions.models import ListSubscription, SubscriptionStatus
from src.utils.datetime import utc_now
from src.worker import main as worker_main
from src.worker import newsletter_digest

_NOW = datetime(2026, 10, 28, 11, 30, tzinfo=UTC)


@pytest.fixture(autouse=True)
async def clean_newsletter_list(db_async: AsyncSession) -> None:
    await db_async.execute(
        delete(ListSubscription).where(ListSubscription.list_key == NEWSLETTER_LIST_KEY)
    )
    await db_async.commit()


@pytest.fixture
def digest_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(subscriptions_settings, "NEWSLETTER_DIGEST_ENABLED", True)


async def _subscriber(
    db: AsyncSession, status: SubscriptionStatus = SubscriptionStatus.CONFIRMED
) -> SimpleNamespace:
    """Snapshot of the row: later helpers expire the ORM objects, and async code
    cannot refresh them lazily."""
    row = ListSubscription(
        list_key=NEWSLETTER_LIST_KEY,
        email=f"reader-{uuid.uuid4().hex[:10]}@example.com",
        status=status.value,
        confirmed_at=utc_now(),
    )
    db.add(row)
    await db.commit()
    return SimpleNamespace(id=row.id, email=row.email, row=row)


async def _no_alerts(*_args: object) -> list[newsletter.DigestAlert]:
    return []


async def _no_posts(_day: object) -> list[newsletter.DigestPost]:
    return []


async def _no_forecast(_now: object) -> list[str]:
    return []


async def _one_alert(*_args: object) -> list[newsletter.DigestAlert]:
    return [
        newsletter.DigestAlert(
            headline="Yellow heavy rain warning",
            event="Heavy rain",
            areas="Grenada",
            expires=None,
            link="https://weather.example.test/alerts/x",
        )
    ]


async def _run(db: AsyncSession, *, now: datetime = _NOW, alerts=_one_alert) -> int:
    return await newsletter_digest.run_daily(
        db,
        now=now,
        alerts_loader=alerts,
        forecast_loader=_no_forecast,
        posts_loader=_no_posts,
    )


async def _mails(db: AsyncSession) -> list[OutboundEmail]:
    db.expire_all()
    return list(
        (
            await db.scalars(
                select(OutboundEmail).where(
                    OutboundEmail.template == NEWSLETTER_TEMPLATE
                )
            )
        ).all()
    )


async def test_the_job_does_nothing_until_the_digest_is_switched_on(
    db_async: AsyncSession,
) -> None:
    await _subscriber(db_async)
    assert await _run(db_async) == 0
    assert await _mails(db_async) == []


async def test_a_day_with_nothing_to_say_sends_nothing(
    db_async: AsyncSession, digest_on: None
) -> None:
    _ = digest_on
    await _subscriber(db_async)
    assert await _run(db_async, alerts=_no_alerts) == 0
    assert await _mails(db_async) == []


async def test_fan_out_reaches_confirmed_unsuppressed_subscribers_only(
    db_async: AsyncSession, digest_on: None
) -> None:
    _ = digest_on
    ok = await _subscriber(db_async)
    await _subscriber(db_async, SubscriptionStatus.PENDING)
    await _subscriber(db_async, SubscriptionStatus.UNSUBSCRIBED)
    blocked = await _subscriber(db_async)
    await notification_service.suppress_email(
        session=db_async,
        email=blocked.email or "",
        reason=SuppressionReason.HARD_BOUNCE,
        source_event_id=None,
    )
    await db_async.commit()

    assert await _run(db_async) == 1
    mails = await _mails(db_async)
    assert [m.to_email for m in mails] == [ok.email]
    mail = mails[0]
    assert mail.transactional is False
    assert mail.subject == "Weather alert: Yellow heavy rain warning - 28 Oct 2026"
    assert mail.props["alerts"][0]["headline"] == "Yellow heavy rain warning"
    assert mail.props["listName"] == "GMS climate newsletter"


async def test_a_second_run_the_same_day_queues_nothing(
    db_async: AsyncSession, digest_on: None
) -> None:
    _ = digest_on
    await _subscriber(db_async)
    assert await _run(db_async) == 1
    assert await _run(db_async, now=_NOW + timedelta(minutes=5)) == 0
    assert len(await _mails(db_async)) == 1


async def test_the_next_day_is_a_new_send(
    db_async: AsyncSession, digest_on: None
) -> None:
    _ = digest_on
    await _subscriber(db_async)
    assert await _run(db_async) == 1
    assert await _run(db_async, now=_NOW + timedelta(days=1)) == 1
    assert len(await _mails(db_async)) == 2


async def test_each_mail_carries_its_own_unsubscribe_link(
    db_async: AsyncSession, digest_on: None
) -> None:
    _ = digest_on
    first = await _subscriber(db_async)
    second = await _subscriber(db_async)
    await _run(db_async)

    by_address = {m.to_email: m for m in await _mails(db_async)}
    for row in (first, second):
        mail = by_address[row.email or ""]
        token = mail.props["unsubscribeLink"].split("token=")[1]
        claims_id = service._read_token(  # noqa: SLF001 - the signed subject
            token, purpose="subscription-unsubscribe"
        )
        assert claims_id == row.id


async def test_sends_are_paced_in_batches(
    db_async: AsyncSession,
    digest_on: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _ = digest_on
    monkeypatch.setattr(subscriptions_settings, "NEWSLETTER_BATCH_SIZE", 2)
    monkeypatch.setattr(subscriptions_settings, "NEWSLETTER_BATCH_INTERVAL_SECONDS", 60)
    readers = [await _subscriber(db_async) for _ in range(5)]
    await _run(db_async)

    due: dict[str, datetime] = {}
    for mail in await _mails(db_async):
        row = await db_async.scalar(
            select(Outbox).where(
                Outbox.topic == notification_service.EMAIL_DELIVER,
                Outbox.dedupe_key == str(mail.id),
            )
        )
        assert row is not None
        due[mail.to_email] = row.next_attempt_at
    naive_now = _NOW.replace(tzinfo=None)  # outbox timestamps are naive UTC
    offsets = sorted(
        int((due[r.email or ""] - naive_now).total_seconds()) for r in readers
    )
    # Batches of two: 0, 0, 60, 60, 120 seconds after the run.
    assert offsets == [0, 0, 60, 60, 120]


def test_the_digest_runs_at_0730_grenada_time() -> None:
    jobs = [
        job
        for job in worker_main.WorkerSettings.cron_jobs
        if job.coroutine.__name__ == "send_daily_newsletter"
    ]
    assert len(jobs) == 1
    # Grenada is UTC-4 all year: 07:30 local is 11:30 UTC.
    assert jobs[0].hour == 11
    assert jobs[0].minute == 30


async def test_a_real_published_alert_feeds_the_digest(
    db_async: AsyncSession, digest_on: None
) -> None:
    from tests.worker.test_dispatch import _add_published_alert

    _ = digest_on
    await _subscriber(db_async)
    alert = await _add_published_alert(db_async)
    identifier = alert.identifier
    await _run(db_async, alerts=newsletter.public_alerts)
    mails = await _mails(db_async)
    assert mails, "an active published alert makes the day worth sending"
    encoded = quote(identifier, safe="")
    links = [a["link"] for a in mails[0].props["alerts"]]
    assert any(link.endswith(f"/alerts/{encoded}") for link in links)
