"""Subscriber preferences: the lists behind an email link, and stopping each one alone.

The signed unsubscribe token from a mail identifies one subscription row. Its keyed
address hash finds the other confirmed lists of the same address. Each list stops
separately; no request ever changes a different address.
"""

import uuid
from urllib.parse import parse_qs, urlparse

import httpx
import jwt
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.subscriptions import service
from src.subscriptions.constants import NEWSLETTER_LIST_KEY, UNSUBSCRIBE_PURPOSE
from src.subscriptions.models import ListSubscription, SubscriptionStatus
from src.utils.datetime import utc_now
from src.utils.email_hash import hash_email

_URL = "/api/v1/subscriptions"


def _address() -> str:
    return f"reader-{uuid.uuid4().hex[:10]}@example.com"


def _token_from(link: str) -> str:
    return parse_qs(urlparse(link).query)["token"][0]


async def _row(
    db: AsyncSession,
    *,
    address: str | None,
    list_key: str,
    status: SubscriptionStatus,
) -> ListSubscription:
    """A subscription row. Unsubscribed rows keep only the hash, as in production."""
    row = ListSubscription(
        list_key=list_key,
        email=None if status == SubscriptionStatus.UNSUBSCRIBED else address,
        email_hash=hash_email(address) if address else None,
        status=status.value,
        confirmed_at=utc_now() if status == SubscriptionStatus.CONFIRMED else None,
    )
    db.add(row)
    await db.commit()
    return row


async def _fresh_pair(
    db: AsyncSession, first_id: uuid.UUID, second_id: uuid.UUID
) -> tuple[ListSubscription, ListSubscription]:
    """Both rows read once after one expiry, so neither goes stale on the other's read."""
    db.expire_all()
    first = await db.get(ListSubscription, first_id)
    second = await db.get(ListSubscription, second_id)
    assert first is not None and second is not None
    return first, second


async def _fresh(db: AsyncSession, row_id: uuid.UUID) -> ListSubscription | None:
    db.expire_all()
    return await db.get(ListSubscription, row_id)


def _mail_token(row: ListSubscription) -> str:
    return _token_from(service.unsubscribe_link(row.id))


async def test_preferences_show_only_the_confirmed_lists_of_that_address(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address, other = _address(), _address()
    newsletter = await _row(
        db_async,
        address=address,
        list_key=NEWSLETTER_LIST_KEY,
        status=SubscriptionStatus.CONFIRMED,
    )
    await _row(
        db_async,
        address=address,
        list_key="signal",
        status=SubscriptionStatus.CONFIRMED,
    )
    await _row(
        db_async, address=address, list_key="barrels", status=SubscriptionStatus.PENDING
    )
    await _row(
        db_async,
        address=address,
        list_key="gms-alerts",
        status=SubscriptionStatus.UNSUBSCRIBED,
    )
    await _row(
        db_async, address=other, list_key="barrels", status=SubscriptionStatus.CONFIRMED
    )

    resp = await async_client.get(
        f"{_URL}/preferences", params={"token": _mail_token(newsletter)}
    )

    assert resp.status_code == 200
    lists = {item["list_key"]: item["list_name"] for item in resp.json()["lists"]}
    assert lists == {
        NEWSLETTER_LIST_KEY: "GMS climate newsletter",
        "signal": "Grenada Signal",
    }


async def test_bad_and_unknown_tokens_get_the_same_refusal(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address = _address()
    row = await _row(
        db_async,
        address=address,
        list_key=NEWSLETTER_LIST_KEY,
        status=SubscriptionStatus.CONFIRMED,
    )
    unknown = jwt.encode(
        {"sub": str(uuid.uuid4()), "purpose": UNSUBSCRIBE_PURPOSE},
        auth_settings.SECRET_KEY,
        algorithm="HS256",
    )
    confirm_token = jwt.encode(
        {"sub": str(row.id), "purpose": "subscription-confirm"},
        auth_settings.SECRET_KEY,
        algorithm="HS256",
    )

    bodies = []
    for token in ("garbage", unknown, confirm_token):
        resp = await async_client.get(f"{_URL}/preferences", params={"token": token})
        assert resp.status_code == 400
        bodies.append(resp.json())
    assert bodies[0] == bodies[1] == bodies[2]

    post = await async_client.post(
        f"{_URL}/preferences/unsubscribe",
        json={"token": "garbage", "list_key": NEWSLETTER_LIST_KEY},
    )
    assert post.status_code == 400
    assert post.json() == bodies[0]
    fresh = await _fresh(db_async, row.id)
    assert fresh is not None
    assert fresh.status == SubscriptionStatus.CONFIRMED.value


async def test_unsubscribing_one_list_keeps_the_others(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address = _address()
    newsletter = await _row(
        db_async,
        address=address,
        list_key=NEWSLETTER_LIST_KEY,
        status=SubscriptionStatus.CONFIRMED,
    )
    signal = await _row(
        db_async,
        address=address,
        list_key="signal",
        status=SubscriptionStatus.CONFIRMED,
    )

    newsletter_id, signal_id = newsletter.id, signal.id
    resp = await async_client.post(
        f"{_URL}/preferences/unsubscribe",
        json={"token": _mail_token(newsletter), "list_key": "signal"},
    )

    assert resp.status_code == 200
    assert [item["list_key"] for item in resp.json()["lists"]] == [NEWSLETTER_LIST_KEY]
    stopped, kept = await _fresh_pair(db_async, signal_id, newsletter_id)
    assert stopped.status == SubscriptionStatus.UNSUBSCRIBED.value
    assert stopped.email is None  # plaintext dropped, hash kept as consent proof
    assert stopped.email_hash == hash_email(address)
    assert kept.status == SubscriptionStatus.CONFIRMED.value


async def test_a_newsletter_mail_link_stops_only_the_newsletter(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address = _address()
    newsletter = await _row(
        db_async,
        address=address,
        list_key=NEWSLETTER_LIST_KEY,
        status=SubscriptionStatus.CONFIRMED,
    )
    signal = await _row(
        db_async,
        address=address,
        list_key="signal",
        status=SubscriptionStatus.CONFIRMED,
    )

    newsletter_id, signal_id = newsletter.id, signal.id
    resp = await async_client.post(
        f"{_URL}/unsubscribe", params={"token": _mail_token(newsletter)}
    )

    assert resp.status_code == 200
    stopped, kept = await _fresh_pair(db_async, newsletter_id, signal_id)
    assert stopped.status == SubscriptionStatus.UNSUBSCRIBED.value
    assert kept.status == SubscriptionStatus.CONFIRMED.value


async def test_a_list_the_address_does_not_have_changes_nothing(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    address, other = _address(), _address()
    newsletter = await _row(
        db_async,
        address=address,
        list_key=NEWSLETTER_LIST_KEY,
        status=SubscriptionStatus.CONFIRMED,
    )
    other_signal = await _row(
        db_async, address=other, list_key="signal", status=SubscriptionStatus.CONFIRMED
    )

    resp = await async_client.post(
        f"{_URL}/preferences/unsubscribe",
        json={"token": _mail_token(newsletter), "list_key": "signal"},
    )

    assert resp.status_code == 200
    assert [item["list_key"] for item in resp.json()["lists"]] == [NEWSLETTER_LIST_KEY]
    untouched = await _fresh(db_async, other_signal.id)
    assert untouched is not None
    assert untouched.status == SubscriptionStatus.CONFIRMED.value
