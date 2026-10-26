"""CAP dissemination channels: email fan-out and browser push worker jobs."""

import uuid
from types import SimpleNamespace
from typing import Any
from urllib.parse import quote

import httpx
import pytest
from pydantic import SecretStr
from pywebpush import WebPushException
from sqlalchemy import delete, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.cap.models import CapAlert, CapJobEvent, CapJobStatus
from src.cap.tasks import PUBLISH_JOB_KINDS
from src.notifications import service as notification_service
from src.notifications.models import OutboundEmail, SuppressionReason
from src.push import service as push_service
from src.push.config import push_settings
from src.push.models import PushSubscription
from src.subscriptions.models import ListSubscription, SubscriptionStatus
from src.utils.datetime import utc_now
from src.worker.dispatch import process_due_jobs
from tests.worker.test_dispatch import _add_published_alert

_LIST = "gms-alerts"


@pytest.fixture(autouse=True)
async def clean_lists(db_async: AsyncSession) -> None:
    await db_async.execute(
        delete(ListSubscription).where(ListSubscription.list_key == _LIST)
    )
    await db_async.execute(delete(PushSubscription))
    await db_async.commit()


async def _subscriber(
    db: AsyncSession, status: SubscriptionStatus = SubscriptionStatus.CONFIRMED
) -> ListSubscription:
    row = ListSubscription(
        list_key=_LIST,
        email=f"alerts-{uuid.uuid4().hex[:10]}@example.com",
        status=status.value,
        confirmed_at=utc_now(),
    )
    db.add(row)
    await db.commit()
    return row


async def _run(db: AsyncSession, alert: CapAlert, kind: str) -> CapJobEvent:
    await db.refresh(alert)
    job = CapJobEvent(alert_id=alert.id, kind=kind, payload={"alert_id": str(alert.id)})
    db.add(job)
    await db.commit()
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda _r: httpx.Response(200))
    ) as client:
        await process_due_jobs(session=db, http_client=client)
    await db.refresh(job)
    return job


async def _mails(db: AsyncSession, identifier: str) -> list[OutboundEmail]:
    return list(
        (
            await db.scalars(
                select(OutboundEmail).where(
                    OutboundEmail.dedupe_key.like(f"cap-alert:{identifier}:%")
                )
            )
        ).all()
    )


def test_publish_enqueues_email_and_push_jobs() -> None:
    assert "publish.email" in PUBLISH_JOB_KINDS
    assert "publish.push" in PUBLISH_JOB_KINDS


async def test_email_fans_out_to_confirmed_subscribers_only(
    db_async: AsyncSession,
) -> None:
    alert = await _add_published_alert(db_async)
    ident = alert.identifier
    confirmed = await _subscriber(db_async)
    await _subscriber(db_async, SubscriptionStatus.PENDING)
    await _subscriber(db_async, SubscriptionStatus.UNSUBSCRIBED)

    job = await _run(db_async, alert, "publish.email")

    assert job.status == CapJobStatus.SUCCEEDED
    mails = await _mails(db_async, ident)
    assert [m.to_email for m in mails] == [confirmed.email]
    mail = mails[0]
    assert mail.transactional is False
    assert mail.template == "cap-alert"
    assert mail.subject == "Weather alert: Yellow heavy rain warning"
    assert mail.props["areas"] == "Grenada"
    assert mail.props["severity"] == "Moderate"
    assert mail.props["alertLink"].endswith(f"/alerts/{quote(ident, safe='')}")
    assert mail.props["capLink"].endswith(f"/api/cap/{quote(ident, safe='')}.xml")
    assert "/subscriptions/unsubscribe?token=" in mail.props["unsubscribeLink"]


async def test_email_is_idempotent_per_alert_and_subscriber(
    db_async: AsyncSession,
) -> None:
    alert = await _add_published_alert(db_async)
    ident = alert.identifier
    await _subscriber(db_async)
    await _run(db_async, alert, "publish.email")
    second = await _run(db_async, alert, "publish.email")

    assert len(await _mails(db_async, ident)) == 1
    assert second.result is not None and second.result["queued"] == 0
    assert second.result["already_queued"] == 1

    late = await _subscriber(db_async)
    await _run(db_async, alert, "publish.email")
    assert {m.to_email for m in await _mails(db_async, ident)} >= {late.email}
    assert len(await _mails(db_async, ident)) == 2


async def test_email_skips_suppressed_addresses(db_async: AsyncSession) -> None:
    alert = await _add_published_alert(db_async)
    ident = alert.identifier
    blocked = await _subscriber(db_async)
    ok = await _subscriber(db_async)
    await notification_service.suppress_email(
        session=db_async,
        email=blocked.email,
        reason=SuppressionReason.HARD_BOUNCE,
        source_event_id=None,
    )
    await db_async.commit()

    await _run(db_async, alert, "publish.email")

    assert [m.to_email for m in await _mails(db_async, ident)] == [ok.email]


@pytest.fixture
def push_on(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(push_settings, "WEBPUSH_VAPID_PUBLIC_KEY", "pub-key")
    monkeypatch.setattr(
        push_settings, "WEBPUSH_VAPID_PRIVATE_KEY", SecretStr("priv-key")
    )
    monkeypatch.setattr(push_settings, "WEBPUSH_CONTACT", "mailto:ops@example.test")


async def _browser(db: AsyncSession, name: str) -> PushSubscription:
    row = PushSubscription(
        list_key=_LIST,
        endpoint=f"https://fcm.googleapis.com/fcm/send/{name}-{uuid.uuid4().hex}",
        p256dh="BPubKeyAAAAAAAAAA",
        auth="authsecretAAAA",
    )
    db.add(row)
    await db.commit()
    return row


def _fake_webpush(
    monkeypatch: pytest.MonkeyPatch, statuses: dict[str, int]
) -> list[dict[str, Any]]:
    sent: list[dict[str, Any]] = []

    def fake(**kw: Any) -> None:
        endpoint = kw["subscription_info"]["endpoint"]
        sent.append(kw)
        for marker, status in statuses.items():
            if marker in endpoint:
                raise WebPushException(
                    "fail", response=SimpleNamespace(status_code=status)
                )

    monkeypatch.setattr(push_service, "webpush", fake)
    return sent


async def test_push_skipped_when_disabled(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(push_settings, "WEBPUSH_VAPID_PRIVATE_KEY", None)
    alert = await _add_published_alert(db_async)
    await _browser(db_async, "a")
    job = await _run(db_async, alert, "publish.push")
    assert job.status == CapJobStatus.SKIPPED
    assert job.result is not None and job.result["skipped"] is True


@pytest.mark.usefixtures("push_on")
async def test_push_success_updates_state_and_payload(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    alert = await _add_published_alert(db_async)
    ident = alert.identifier
    browser = await _browser(db_async, "ok")
    sent = _fake_webpush(monkeypatch, {})

    job = await _run(db_async, alert, "publish.push")

    assert job.status == CapJobStatus.SUCCEEDED
    assert len(sent) == 1
    assert '"title": "Yellow heavy rain warning"' in sent[0]["data"]
    assert f"/alerts/{quote(ident, safe='')}" in sent[0]["data"]
    await db_async.refresh(browser)
    assert browser.last_success_at is not None and browser.failure_count == 0


@pytest.mark.usefixtures("push_on")
async def test_push_removes_gone_subscriptions(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    alert = await _add_published_alert(db_async)
    await _browser(db_async, "gone")
    keep = await _browser(db_async, "keep")
    _fake_webpush(monkeypatch, {"gone": 410})

    job = await _run(db_async, alert, "publish.push")

    assert job.status == CapJobStatus.SUCCEEDED
    assert job.result is not None and job.result["removed"] == 1
    db_async.expire_all()
    remaining = (await db_async.scalars(select(PushSubscription))).all()
    assert [r.id for r in remaining] == [keep.id]


@pytest.mark.usefixtures("push_on")
async def test_push_failure_retries_only_undelivered_browsers(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    alert = await _add_published_alert(db_async)
    ok = await _browser(db_async, "ok")
    flaky = await _browser(db_async, "flaky")
    _fake_webpush(monkeypatch, {"flaky": 503})

    job = await _run(db_async, alert, "publish.push")

    assert job.status == CapJobStatus.FAILED
    assert job.result is not None and job.result["delivered"] == [str(ok.id)]
    await db_async.refresh(flaky)
    assert flaky.failure_count == 1

    # The browser recovers; the retry must not push to the first one again.
    _fake_webpush(monkeypatch, {})
    job.next_retry_at = None
    await db_async.commit()
    async with httpx.AsyncClient() as client:
        await process_due_jobs(session=db_async, http_client=client)
    await db_async.refresh(job)
    assert job.status == CapJobStatus.SUCCEEDED
    assert job.result is not None and job.result["delivered"] == [
        str(ok.id),
        str(flaky.id),
    ]
