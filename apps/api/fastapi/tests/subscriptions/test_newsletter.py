"""Climate newsletter: list, sign-up, safe unsubscribe and the staff test send."""

import uuid
from urllib.parse import parse_qs, urlparse

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.email_config import email_settings
from src.notifications import service as notification_service
from src.notifications.models import OutboundEmail
from src.subscriptions import service
from src.subscriptions.config import subscriptions_settings
from src.subscriptions.constants import (
    MAILING_LISTS,
    NEWSLETTER_LIST_KEY,
    NEWSLETTER_TEMPLATE,
)
from src.subscriptions.models import ListSubscription, SubscriptionStatus
from src.utils.datetime import utc_now
from src.utils.email_hash import hash_email

_URL = "/api/v1/subscriptions"


def _address() -> str:
    return f"reader-{uuid.uuid4().hex[:10]}@example.com"


def _unsubscribe_token(reader: ListSubscription) -> str:
    link = service.unsubscribe_link(reader.id)
    return parse_qs(urlparse(link).query)["token"][0]


async def _confirmed_newsletter_reader(
    db: AsyncSession, address: str | None = None
) -> ListSubscription:
    email = address or _address()
    row = ListSubscription(
        list_key=NEWSLETTER_LIST_KEY,
        email=email,
        email_hash=hash_email(email),
        status=SubscriptionStatus.CONFIRMED.value,
        confirmed_at=utc_now(),
    )
    db.add(row)
    await db.commit()
    return row


async def _row(db: AsyncSession, row_id: uuid.UUID) -> ListSubscription | None:
    db.expire_all()
    return await db.get(ListSubscription, row_id)


async def _newsletter_mails(db: AsyncSession, address: str) -> list[OutboundEmail]:
    db.expire_all()
    return list(
        (
            await db.scalars(
                select(OutboundEmail).where(
                    OutboundEmail.to_email == address,
                    OutboundEmail.template == NEWSLETTER_TEMPLATE,
                )
            )
        ).all()
    )


def test_newsletter_list_has_its_own_name_and_site_origin() -> None:
    assert NEWSLETTER_LIST_KEY == "gms-newsletter"
    assert MAILING_LISTS[NEWSLETTER_LIST_KEY].name == "GMS climate newsletter"
    assert "gms-newsletter" in subscriptions_settings.SUBSCRIPTIONS_SITE_URLS


async def test_newsletter_sign_up_is_pending_and_names_its_own_list(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address = _address()
    resp = await async_client.post(
        _URL, json={"list_key": NEWSLETTER_LIST_KEY, "email": address}
    )
    assert resp.status_code == 202
    db_async.expire_all()
    mail = await db_async.scalar(
        select(OutboundEmail).where(OutboundEmail.to_email == address)
    )
    assert mail is not None
    assert mail.subject == "Confirm your subscription to GMS climate newsletter"
    assert mail.props["listName"] == "GMS climate newsletter"


async def test_get_unsubscribe_never_unsubscribes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    reader = await _confirmed_newsletter_reader(db_async)

    # What a mail scanner does: GET the link from the email.
    resp = await async_client.get(
        f"{_URL}/unsubscribe",
        params={"token": _unsubscribe_token(reader)},
        follow_redirects=False,
    )
    assert resp.status_code == 303
    assert "/subscriptions/unsubscribe/confirm?token=" in resp.headers["location"]

    row = await _row(db_async, reader.id)
    assert row is not None
    assert row.status == SubscriptionStatus.CONFIRMED.value


async def test_manage_page_names_the_list_and_changes_nothing(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    reader = await _confirmed_newsletter_reader(db_async)

    resp = await async_client.get(
        f"{_URL}/unsubscribe/confirm", params={"token": _unsubscribe_token(reader)}
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/html")
    assert "GMS climate newsletter" in resp.text
    assert "/api/v1/subscriptions/unsubscribe?token=" in resp.text
    assert 'method="post"' in resp.text
    row = await _row(db_async, reader.id)
    assert row is not None
    assert row.status == SubscriptionStatus.CONFIRMED.value


async def test_post_unsubscribe_stops_the_list_one_click(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address = _address()
    reader = await _confirmed_newsletter_reader(db_async, address)

    resp = await async_client.post(
        f"{_URL}/unsubscribe", params={"token": _unsubscribe_token(reader)}
    )
    assert resp.status_code == 200
    assert "You are unsubscribed from GMS climate newsletter" in resp.text
    row = await _row(db_async, reader.id)
    assert row is not None
    assert row.status == SubscriptionStatus.UNSUBSCRIBED.value
    assert row.email is None  # only the keyed hash remains
    assert row.email_hash == hash_email(address)


async def test_bad_tokens_get_a_plain_refusal_and_change_nothing(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    reader = await _confirmed_newsletter_reader(db_async)

    manage = await async_client.get(
        f"{_URL}/unsubscribe/confirm", params={"token": "garbage"}
    )
    assert manage.status_code == 400
    assert "not valid" in manage.text

    post = await async_client.post(f"{_URL}/unsubscribe", params={"token": "garbage"})
    assert post.status_code == 400

    # A confirmation token cannot unsubscribe.
    confirm_token = service._make_token(  # noqa: SLF001 - the purpose check under test
        subscription_id=reader.id,
        purpose="subscription-confirm",
        ttl=None,
    )
    post = await async_client.post(
        f"{_URL}/unsubscribe", params={"token": confirm_token}
    )
    assert post.status_code == 400
    row = await _row(db_async, reader.id)
    assert row is not None
    assert row.status == SubscriptionStatus.CONFIRMED.value


async def test_newsletter_mail_is_sent_with_one_click_list_headers(
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
    outbound_email_calls: list[dict[str, object]],
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)
    address = _address()
    reader = await _confirmed_newsletter_reader(db_async, address)
    notification_service.enqueue_email(
        session=db_async,
        to_email=address,
        subject="Daily update",
        transactional=False,
        template=NEWSLETTER_TEMPLATE,
        props={
            "projectName": "Barrels Grenada",
            "listName": "GMS climate newsletter",
            "headline": "Today",
            "unsubscribeLink": service.unsubscribe_link(reader.id),
            "alerts": [],
            "forecastLines": [],
            "posts": [],
            "testNotice": None,
        },
    )
    await db_async.commit()

    await outbox.drain(
        db_async, limit=10_000, only_topics=[notification_service.EMAIL_DELIVER]
    )

    calls = [c for c in outbound_email_calls if c["email_to"] == address]
    assert len(calls) == 1
    headers = calls[0]["headers"]
    assert isinstance(headers, dict)
    assert headers["List-Unsubscribe-Post"] == "List-Unsubscribe=One-Click"
    assert headers["List-Unsubscribe"].startswith("<")
    assert "/subscriptions/unsubscribe?token=" in headers["List-Unsubscribe"]


async def test_test_send_mails_one_confirmed_address_only(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    reader = await _confirmed_newsletter_reader(db_async)
    other = await _confirmed_newsletter_reader(db_async)
    reader_email, other_email = reader.email, other.email

    resp = await async_client.post(
        f"{_URL}/admin/newsletter/test",
        headers=superuser_token_headers_async,
        json={"email": reader_email},
    )
    assert resp.status_code == 202
    assert resp.json()["queued"] is True

    db_async.expire_all()
    mails = (
        await db_async.scalars(
            select(OutboundEmail).where(OutboundEmail.template == NEWSLETTER_TEMPLATE)
        )
    ).all()
    assert [m.to_email for m in mails] == [reader_email]
    mail = mails[0]
    assert mail.transactional is False
    assert mail.subject.startswith("Test: ")
    assert mail.props["testNotice"].startswith("This is a test copy")
    assert "/subscriptions/unsubscribe?token=" in mail.props["unsubscribeLink"]
    assert other_email not in {m.to_email for m in mails}


async def test_test_send_refuses_an_address_that_is_not_confirmed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    superuser_token_headers_async: dict[str, str],
) -> None:
    address = _address()
    resp = await async_client.post(
        f"{_URL}/admin/newsletter/test",
        headers=superuser_token_headers_async,
        json={"email": address},
    )
    assert resp.status_code == 409
    assert await _newsletter_mails(db_async, address) == []


async def test_test_send_needs_the_newsletter_permission(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    reader = await _confirmed_newsletter_reader(db_async)
    resp = await async_client.post(
        f"{_URL}/admin/newsletter/test",
        headers=normal_user_token_headers_async,
        json={"email": reader.email},
    )
    assert resp.status_code == 403
    assert await _newsletter_mails(db_async, reader.email or "") == []


async def test_test_send_requires_sign_in(async_client: httpx.AsyncClient) -> None:
    resp = await async_client.post(
        f"{_URL}/admin/newsletter/test", json={"email": _address()}
    )
    assert resp.status_code == 401
