"""Manage links in every customer mail, minted on demand (see ``manage_link``).

The confirmed, reminder, customer and staff reschedule, and deposit-paid mails
carry a signed link. The cancellation mail carries none. The legacy random token
keeps working, and the signed link opens the booking only while it is valid.
"""

import html
import logging
import re
import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import manage_link, reminders
from src.bookings.public import account_signup_url
from src.utils.datetime import utc_now
from tests.bookings.test_account_link import _signed_in_book
from tests.bookings.test_deposits import _paid_booking
from tests.bookings.test_public_bookings import (
    API,
    MANAGE,
    _book,
    _booked,
    _booking_for,
    _emails,
    _slots,
    _studio,
)
from tests.email_payload import payload_html
from tests.factories import make_user
from tests.organisations.support import headers_for

MANAGE_PREFIX = MANAGE.split("{token}")[0]
LINK = re.compile(r'href="(' + re.escape(MANAGE_PREFIX) + r'[^"]+)"')
INVITE = "Create a free account or sign in"


def _manage_token(html: str) -> str:
    """The one manage link in a mail, as its token."""
    [link] = LINK.findall(html)
    return link.removeprefix(MANAGE_PREFIX)


async def _mail_html(db: AsyncSession, org_id: str, prefix: str) -> str:
    [row] = [
        row for row in await _emails(db, org_id) if row.dedupe_key.startswith(prefix)
    ]
    return str(payload_html(row.payload))


def _flip_last(text: str) -> str:
    return text[:-1] + ("A" if text[-1] != "A" else "B")


async def _open(client: httpx.AsyncClient, token: str) -> httpx.Response:
    return await client.get(f"{API}/public/bookings/{token}")


async def test_the_confirmed_mail_carries_a_link_that_opens_the_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, requires_confirmation=True)
    slots = await _slots(async_client, studio)
    receipt = (await _book(async_client, studio, slots[0])).json()
    booking_id = receipt["booking"]["id"]
    confirm = await async_client.post(
        f"{API}/org/bookings/{booking_id}/confirm", headers=studio.headers
    )
    assert confirm.status_code == 200, confirm.text

    token = _manage_token(
        await _mail_html(db_async, studio.org_id, f"booking-confirmed:{booking_id}")
    )
    assert manage_link.is_signed(token)
    assert token != receipt["manage_token"]
    opened = await _open(async_client, token)
    assert opened.status_code == 200
    assert opened.json()["id"] == booking_id
    # The legacy token still opens the same booking.
    assert (await _open(async_client, receipt["manage_token"])).status_code == 200


async def test_the_deposit_paid_mail_carries_a_link(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _paid_booking(db_async, async_client)
    token = _manage_token(
        await _mail_html(db_async, studio.org_id, f"booking-confirmation:{booking_id}")
    )
    opened = await _open(async_client, token)
    assert opened.status_code == 200
    assert opened.json()["id"] == booking_id


async def test_the_reminder_carries_a_link_and_the_account_invitation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt, _ = await _booked(db_async, async_client)
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    inside = booking.starts_at - timedelta(hours=20)
    queued = await reminders.enqueue_due_reminders(
        db_async, now=inside, organisation_id=studio.org_id
    )
    assert queued == 1
    await db_async.commit()
    html = await _mail_html(db_async, studio.org_id, f"booking-reminder:{booking.id}")
    opened = await _open(async_client, _manage_token(html))
    assert opened.status_code == 200
    assert opened.json()["id"] == str(booking.id)
    assert INVITE in html
    assert html.count(f'href="{_escaped_signup(studio.slug)}"') == 1


async def test_a_reminder_for_a_linked_account_has_no_invitation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    account = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    response = await _signed_in_book(
        async_client, studio, headers_for(account), customer_email=account.email
    )
    assert response.status_code == 201, response.text
    booking = await _booking_for(db_async, response.json()["booking"]["id"])
    queued = await reminders.enqueue_due_reminders(
        db_async,
        now=booking.starts_at - timedelta(hours=20),
        organisation_id=studio.org_id,
    )
    assert queued == 1
    await db_async.commit()
    html = await _mail_html(db_async, studio.org_id, f"booking-reminder:{booking.id}")
    assert INVITE not in html
    assert _manage_token(html)  # the link still ships


async def test_the_customer_reschedule_mail_carries_a_link(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt, slots = await _booked(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    moved = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/reschedule",
        json={"starts_at": slots[-1]},
    )
    assert moved.status_code == 200, moved.text
    html = await _mail_html(
        db_async, studio.org_id, f"booking-rescheduled:{booking_id}:"
    )
    opened = await _open(async_client, _manage_token(html))
    assert opened.status_code == 200
    assert opened.json()["starts_at"] == moved.json()["starts_at"]


async def test_the_staff_reschedule_mail_carries_a_link(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt, slots = await _booked(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    moved = await async_client.post(
        f"{API}/org/bookings/{booking_id}/reschedule",
        headers=studio.headers,
        json={"starts_at": slots[-1]},
    )
    assert moved.status_code == 200, moved.text
    html = await _mail_html(
        db_async, studio.org_id, f"booking-rescheduled-by-studio:{booking_id}:"
    )
    opened = await _open(async_client, _manage_token(html))
    assert opened.status_code == 200
    assert opened.json()["id"] == booking_id


async def test_the_cancellation_mail_carries_no_link(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt, _ = await _booked(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    cancel = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/cancel"
    )
    assert cancel.status_code == 200, cancel.text
    html = await _mail_html(db_async, studio.org_id, f"booking-cancelled:{booking_id}")
    assert "href=" not in html
    assert MANAGE_PREFIX not in html
    assert INVITE not in html


async def test_a_tampered_expired_wrong_purpose_or_unknown_link_is_404(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, receipt, _ = await _booked(db_async, async_client)
    booking_id = uuid.UUID(receipt["booking"]["id"])
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    good = manage_link.mint(booking_id, booking.ends_at)
    assert (await _open(async_client, good)).status_code == 200

    unknown_legacy = await _open(async_client, "a" * 43)
    assert unknown_legacy.status_code == 404
    rejected = {
        "tampered": _flip_last(good),
        "expired": manage_link.mint(booking_id, utc_now() - timedelta(days=31)),
        "another purpose": manage_link.mint(booking_id, booking.ends_at, purpose="pay"),
        "an unknown booking": manage_link.mint(uuid.uuid4(), booking.ends_at),
    }
    for label, token in rejected.items():
        response = await _open(async_client, token)
        assert response.status_code == 404, label
        # Same answer as an unknown legacy token: nothing reveals which check failed.
        assert response.json() == unknown_legacy.json(), label


async def test_clearing_the_stored_token_revokes_the_signed_link(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, receipt, _ = await _booked(db_async, async_client)
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    token = manage_link.mint(booking.id, booking.ends_at)
    assert (await _open(async_client, token)).status_code == 200
    # Retention clears manage_token_hash after the booking ends; the signed link
    # follows it, so one switch closes every way in.
    booking.manage_token_hash = None
    await db_async.commit()
    assert (await _open(async_client, token)).status_code == 404


async def test_a_signed_link_opens_a_cancelled_booking_read_only(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, receipt, _ = await _booked(db_async, async_client)
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    token = manage_link.mint(booking.id, booking.ends_at)
    cancel = await async_client.post(f"{API}/public/bookings/{token}/cancel")
    assert cancel.status_code == 200, cancel.text
    opened = await _open(async_client, token)
    assert opened.status_code == 200
    assert opened.json()["status"] == "cancelled"
    assert opened.json()["can_cancel"] is False
    again = await async_client.post(f"{API}/public/bookings/{token}/cancel")
    assert again.status_code == 200
    assert again.json()["status"] == "cancelled"


async def test_a_signed_link_opens_a_completed_booking_read_only(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, _, _ = await _booked(db_async, async_client)
    # The first booking holds slot 0; the next free slot is offered afresh.
    free = await _slots(async_client, studio)
    booking_id = (await _book(async_client, studio, free[0])).json()["booking"]["id"]
    booking = await _booking_for(db_async, booking_id)
    done = await async_client.post(
        f"{API}/org/bookings/{booking_id}/complete", headers=studio.headers
    )
    assert done.status_code == 200, done.text
    token = manage_link.mint(booking.id, booking.ends_at)
    opened = await _open(async_client, token)
    assert opened.status_code == 200
    assert opened.json()["status"] == "completed"
    refused = await async_client.post(f"{API}/public/bookings/{token}/cancel")
    assert refused.status_code == 409


async def test_the_manage_page_offers_the_invitation_to_a_guest_only(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt, _ = await _booked(db_async, async_client)
    expected = account_signup_url(studio.slug)
    assert receipt["booking"]["account_invite_url"] == expected
    opened = await _open(async_client, receipt["manage_token"])
    assert opened.json()["account_invite_url"] == expected

    account = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    response = await _signed_in_book(
        async_client, studio, headers_for(account), customer_email=account.email
    )
    assert response.json()["booking"]["account_invite_url"] is None


async def test_no_manage_link_or_token_reaches_the_logs(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    caplog: pytest.LogCaptureFixture,
) -> None:
    caplog.set_level(logging.DEBUG)
    studio = await _studio(db_async, async_client, requires_confirmation=True)
    slots = await _slots(async_client, studio)
    receipt = (await _book(async_client, studio, slots[0])).json()
    booking_id = receipt["booking"]["id"]
    await async_client.post(
        f"{API}/org/bookings/{booking_id}/confirm", headers=studio.headers
    )
    booking = await _booking_for(db_async, booking_id)
    await reminders.enqueue_due_reminders(
        db_async,
        now=booking.starts_at - timedelta(hours=20),
        organisation_id=studio.org_id,
    )
    await db_async.commit()
    confirmed = await _mail_html(
        db_async, studio.org_id, f"booking-confirmed:{booking_id}"
    )
    reminder = await _mail_html(
        db_async, studio.org_id, f"booking-reminder:{booking_id}"
    )
    secrets_in_mail = [
        _manage_token(confirmed),
        _manage_token(reminder),
        receipt["manage_token"],
    ]
    for secret in secrets_in_mail:
        assert secret not in caplog.text


def _escaped_signup(slug: str) -> str:
    return html.escape(account_signup_url(slug), quote=True)
