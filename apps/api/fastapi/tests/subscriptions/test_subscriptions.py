"""Double opt-in subscriptions: subscribe, confirm, unsubscribe, suppression."""

import uuid
from datetime import timedelta
from typing import Any
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import email as email_module
from src import outbox
from src.email_config import email_settings
from src.notifications import service as notification_service
from src.notifications.models import (
    EmailSuppression,
    OutboundEmail,
    OutboundEmailStatus,
    SuppressionReason,
)
from src.subscriptions import service
from src.subscriptions.config import subscriptions_settings
from src.subscriptions.constants import CONFIRM_PURPOSE
from src.subscriptions.models import ListSubscription, SubscriptionStatus
from src.utils.datetime import utc_now
from src.utils.email_hash import hash_email

_URL = "/api/v1/subscriptions"


def _address() -> str:
    return f"reader-{uuid.uuid4().hex[:10]}@example.com"


async def _subscribe(
    client: httpx.AsyncClient, email: str, list_key: str = "signal"
) -> httpx.Response:
    return await client.post(_URL, json={"list_key": list_key, "email": email})


async def _row(db: AsyncSession, email: str) -> ListSubscription | None:
    db.expire_all()
    return await db.scalar(
        select(ListSubscription).where(ListSubscription.email_hash == hash_email(email))
    )


async def _outbox(db: AsyncSession, email: str) -> list[OutboundEmail]:
    db.expire_all()
    return list(
        (
            await db.scalars(
                select(OutboundEmail).where(OutboundEmail.to_email == email)
            )
        ).all()
    )


async def _drain_email_outbox(db: AsyncSession) -> None:
    """Run the worker's ``drain_outbox`` for email (the outbox is the retry engine)."""
    await outbox.drain(
        db, limit=10_000, only_topics=[notification_service.EMAIL_DELIVER]
    )


def _token(link: str) -> str:
    return parse_qs(urlparse(link).query)["token"][0]


async def test_subscribe_creates_pending_row_and_queues_confirmation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address = _address()
    resp = await _subscribe(async_client, address.upper())
    assert resp.status_code == 202

    row = await _row(db_async, address)
    assert row is not None
    assert row.status == SubscriptionStatus.PENDING.value
    assert row.confirmed_at is None
    mails = await _outbox(db_async, address)
    assert len(mails) == 1
    assert mails[0].transactional is False
    assert mails[0].template == "subscription-confirm"
    assert "/subscriptions/confirm?token=" in mails[0].props["confirmLink"]


async def test_barrels_list_uses_its_own_site_for_confirmation(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        subscriptions_settings,
        "SUBSCRIPTIONS_SITE_URLS",
        {"signal": "https://signal.example", "barrels": "https://barrels.example"},
    )
    address = _address()
    resp = await _subscribe(async_client, address, list_key="barrels")
    assert resp.status_code == 202

    row = await _row(db_async, address)
    assert row is not None
    assert row.list_key == "barrels"
    assert row.status == SubscriptionStatus.PENDING.value
    mails = await _outbox(db_async, address)
    assert len(mails) == 1
    assert mails[0].props["listName"] == "Barrels Grenada"

    confirm = await async_client.get(
        "/api/v1/subscriptions/confirm",
        params={"token": _token(mails[0].props["confirmLink"])},
        follow_redirects=False,
    )
    assert confirm.status_code == 303
    assert confirm.headers["location"] == (
        "https://barrels.example/subscribe/status?result=confirmed"
    )


async def test_response_is_identical_for_every_state(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    fresh, confirmed, suppressed = _address(), _address(), _address()
    db_async.add(
        ListSubscription(
            list_key="signal",
            email=confirmed,
            status=SubscriptionStatus.CONFIRMED.value,
        )
    )
    await notification_service.suppress_email(
        session=db_async,
        email=suppressed,
        reason=SuppressionReason.HARD_BOUNCE,
        source_event_id=None,
    )
    await db_async.commit()

    bodies = []
    for address in (fresh, confirmed, suppressed, fresh):
        resp = await _subscribe(async_client, address)
        assert resp.status_code == 202
        bodies.append(resp.json())
    assert all(body == bodies[0] for body in bodies)

    assert len(await _outbox(db_async, fresh)) == 1  # repeat inside the window
    assert await _outbox(db_async, confirmed) == []
    assert await _outbox(db_async, suppressed) == []
    assert await _row(db_async, suppressed) is None


async def test_pending_address_is_mailed_again_after_the_window(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address = _address()
    await _subscribe(async_client, address)
    row = await _row(db_async, address)
    assert row is not None
    row.last_confirmation_sent_at = utc_now() - timedelta(hours=1)
    await db_async.commit()

    await _subscribe(async_client, address)
    assert len(await _outbox(db_async, address)) == 2


async def test_confirm_marks_confirmed_and_redirects(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address = _address()
    await _subscribe(async_client, address)
    mail = (await _outbox(db_async, address))[0]
    token = _token(mail.props["confirmLink"])

    for _ in range(2):  # following the link twice is harmless
        resp = await async_client.get(
            f"{_URL}/confirm", params={"token": token}, follow_redirects=False
        )
        assert resp.status_code == 303
        assert resp.headers["location"].endswith("/subscribe/status?result=confirmed")

    row = await _row(db_async, address)
    assert row is not None
    assert row.status == SubscriptionStatus.CONFIRMED.value
    assert row.confirmed_at is not None


async def test_invalid_tokens_redirect_without_changing_anything(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address = _address()
    await _subscribe(async_client, address)
    mail = (await _outbox(db_async, address))[0]
    unsubscribe_token = _token(mail.props["unsubscribeLink"])

    # An unsubscribe token cannot confirm, and vice versa.
    resp = await async_client.get(
        f"{_URL}/confirm", params={"token": unsubscribe_token}, follow_redirects=False
    )
    assert resp.headers["location"].endswith("result=invalid")
    resp = await async_client.get(
        f"{_URL}/unsubscribe", params={"token": "garbage"}, follow_redirects=False
    )
    assert resp.status_code == 303
    assert resp.headers["location"].endswith("result=invalid")

    row = await _row(db_async, address)
    assert row is not None
    assert row.status == SubscriptionStatus.PENDING.value


async def test_expired_confirm_token_is_rejected(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address = _address()
    await _subscribe(async_client, address)
    row = await _row(db_async, address)
    assert row is not None
    expired = service._make_token(  # noqa: SLF001 - building a stale token
        subscription_id=row.id, purpose=CONFIRM_PURPOSE, ttl=timedelta(seconds=-5)
    )
    resp = await async_client.get(
        f"{_URL}/confirm", params={"token": expired}, follow_redirects=False
    )
    assert resp.headers["location"].endswith("result=invalid")
    row = await _row(db_async, address)
    assert row is not None
    assert row.status == SubscriptionStatus.PENDING.value


async def test_unsubscribe_then_resubscribe_restarts_double_opt_in(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address = _address()
    await _subscribe(async_client, address)
    mail = (await _outbox(db_async, address))[0]
    await async_client.get(
        f"{_URL}/confirm",
        params={"token": _token(mail.props["confirmLink"])},
        follow_redirects=False,
    )
    resp = await async_client.get(
        f"{_URL}/unsubscribe",
        params={"token": _token(mail.props["unsubscribeLink"])},
        follow_redirects=False,
    )
    assert resp.headers["location"].endswith("result=unsubscribed")
    row = await _row(db_async, address)
    assert row is not None
    assert row.status == SubscriptionStatus.UNSUBSCRIBED.value
    assert row.unsubscribed_at is not None
    assert row.email is None  # only the keyed hash is kept as consent proof
    assert row.email_hash == hash_email(address)

    await _subscribe(async_client, address)
    row = await _row(db_async, address)
    assert row is not None
    assert row.status == SubscriptionStatus.PENDING.value
    assert row.confirmed_at is None
    assert row.email == address  # plaintext restored: needed to send
    assert len(await _outbox(db_async, address)) == 2


async def test_unknown_list_and_bad_email_are_rejected(
    async_client: httpx.AsyncClient,
) -> None:
    assert (await _subscribe(async_client, _address(), "nope")).status_code == 422
    assert (await _subscribe(async_client, "not-an-email")).status_code == 422


async def test_worker_skips_suppressed_marketing_but_sends_transactional(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)
    address = _address()
    await notification_service.suppress_email(
        session=db_async,
        email=address,
        reason=SuppressionReason.COMPLAINT,
        source_event_id="evt",
    )
    marketing = notification_service.enqueue_email(
        session=db_async,
        to_email=address,
        subject="News",
        transactional=False,
        html="<p>news</p>",
    )
    transactional = notification_service.enqueue_email(
        session=db_async,
        to_email=address,
        subject="Sign-in code",
        transactional=True,
        html="<p>code</p>",
    )
    await db_async.commit()

    sent: list[dict[str, Any]] = []
    monkeypatch.setattr(email_module, "send_email", lambda **kw: sent.append(kw))

    await _drain_email_outbox(db_async)

    await db_async.refresh(marketing)
    await db_async.refresh(transactional)
    assert marketing.status == OutboundEmailStatus.SKIPPED.value
    assert transactional.status == OutboundEmailStatus.SENT.value
    assert [m["subject"] for m in sent if m["email_to"] == address] == ["Sign-in code"]


async def test_worker_renders_confirmation_with_jinja_fallback(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)
    address = _address()
    await _subscribe(async_client, address)
    mail = (await _outbox(db_async, address))[0]
    confirm_link = mail.props["confirmLink"]

    sent: list[dict[str, Any]] = []
    monkeypatch.setattr(email_module, "send_email", lambda **kw: sent.append(kw))
    await _drain_email_outbox(db_async)

    ours = [m for m in sent if m["email_to"] == address]
    assert len(ours) == 1
    assert "Grenada Signal" in ours[0]["subject"]
    assert confirm_link.replace("&", "&amp;") in ours[0]["html_content"] or (
        confirm_link in ours[0]["html_content"]
    )
    db_async.expire_all()
    # Tokens are scrubbed once the mail is out.
    assert (await _outbox(db_async, address))[0].props == {}


async def test_legacy_plaintext_rows_are_still_matched_and_hashed_on_contact(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    pending, suppressed = _address(), _address()
    db_async.add(ListSubscription(list_key="signal", email=pending))
    db_async.add(
        EmailSuppression(email=suppressed, reason=SuppressionReason.COMPLAINT.value)
    )
    await db_async.commit()

    await _subscribe(async_client, pending)
    await _subscribe(async_client, suppressed)

    row = await _row(db_async, pending)
    assert row is not None
    assert row.email == pending
    assert row.email_hash == hash_email(pending)  # lazily backfilled
    assert len(await _outbox(db_async, pending)) == 1
    assert await _outbox(db_async, suppressed) == []  # legacy plaintext suppression
    assert await notification_service.is_suppressed(
        session=db_async, email=suppressed.upper()
    )


async def test_suppression_stores_only_the_hash_and_checks_by_hash(
    db_async: AsyncSession,
) -> None:
    address = _address()
    added = await notification_service.suppress_email(
        session=db_async,
        email=f"  {address.upper()} ",
        reason=SuppressionReason.HARD_BOUNCE,
        source_event_id=None,
    )
    again = await notification_service.suppress_email(
        session=db_async,
        email=address,
        reason=SuppressionReason.HARD_BOUNCE,
        source_event_id=None,
    )
    await db_async.commit()
    assert (added, again) == (True, False)
    row = await db_async.scalar(
        select(EmailSuppression).where(
            EmailSuppression.email_hash == hash_email(address)
        )
    )
    assert row is not None
    assert row.email is None
    assert await notification_service.is_suppressed(session=db_async, email=address)
    assert not await notification_service.is_suppressed(
        session=db_async, email=_address()
    )


async def _site(db: AsyncSession, **settings: object) -> str:
    """A fresh public site owned by a new organisation; returns its key."""
    from src.organisations.models import PublicSite, new_public_site_id
    from tests.organisations.support import make_org

    org = await make_org(db, f"List Co {uuid.uuid4().hex[:6]}")
    key = f"list-{uuid.uuid4().hex[:8]}"
    defaults: dict[str, object] = {
        "accepts_contact": False,
        "accepts_subscriptions": True,
        "turnstile_mode": "inherit",
    }
    db.add(
        PublicSite(
            id=new_public_site_id(),
            organisation_id=org.id,
            key=key,
            name="Site List",
            **{**defaults, **settings},
        )
    )
    await db.commit()
    return key


async def test_site_route_subscribes_to_a_site_list_and_redirects_to_its_origin(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    key = await _site(db_async, site_url="https://list.example/")
    address = _address()
    resp = await async_client.post(f"{_URL}/public/{key}", json={"email": address})
    assert resp.status_code == 202
    assert resp.json() == {"message": service.ACCEPTED_MESSAGE}

    row = await _row(db_async, address)
    assert row is not None and row.list_key == key
    mails = await _outbox(db_async, address)
    assert mails[0].props["listName"] == "Site List"
    confirm = await async_client.get(
        "/api/v1/subscriptions/confirm",
        params={"token": _token(mails[0].props["confirmLink"])},
        follow_redirects=False,
    )
    assert confirm.headers["location"] == (
        "https://list.example/subscribe/status?result=confirmed"
    )


async def test_site_route_refuses_unknown_and_contact_only_sites(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    unknown = await async_client.post(
        f"{_URL}/public/no-such-site", json={"email": _address()}
    )
    assert unknown.status_code == 404
    key = await _site(db_async, accepts_subscriptions=False)
    refused = await async_client.post(
        f"{_URL}/public/{key}", json={"email": _address()}
    )
    assert refused.status_code == 404


async def test_site_url_from_the_site_row_beats_the_environment(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    key = await _site(db_async, site_url="https://row.example")
    monkeypatch.setattr(
        subscriptions_settings, "SUBSCRIPTIONS_SITE_URLS", {key: "https://env.example"}
    )
    assert await service.site_url_for(db_async, key) == "https://row.example"
    bare = await _site(db_async)
    monkeypatch.setattr(
        subscriptions_settings, "SUBSCRIPTIONS_SITE_URLS", {bare: "https://env.example"}
    )
    assert await service.site_url_for(db_async, bare) == "https://env.example"
