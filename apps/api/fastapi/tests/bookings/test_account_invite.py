"""Booking emails invite a guest to create a free account (ADR-0058), never insist.

The invitation says only what the code does: bookings with the business, including
earlier guest ones made with the same email, are listed under My bookings once the
person is signed in with that verified email and has booked with the business again
(that booking is what links the business's contact record to the account).
"""

import html
import re
import uuid
from datetime import datetime
from pathlib import Path
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.bookings import emails
from src.bookings.public import account_signup_url
from src.utils.timezones import zone
from tests.bookings.test_account_link import _signed_in_book
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _emails,
    _slots,
    _studio,
)
from tests.email_payload import card_html, payload_html
from tests.factories import make_user
from tests.organisations.support import headers_for

INVITE = "Create a free account or sign in"


def _href(slug: str) -> str:
    """The sign-up address as it appears in a mail's href (HTML-escaped)."""
    return html.escape(account_signup_url(slug), quote=True)


async def _mail(db: AsyncSession, studio: Studio, booking_id: str, kind: str) -> str:
    [row] = [
        row
        for row in await _emails(db, studio.org_id)
        if row.dedupe_key == f"{kind}:{booking_id}"
    ]
    return str(payload_html(row.payload))


def test_the_sign_up_address_returns_the_person_signed_in_to_the_booking_page() -> None:
    address = urlsplit(account_signup_url("sea-salt-spa"))
    auth = urlsplit(auth_settings.AUTH_FRONTEND_URL)
    assert (address.scheme, address.netloc, address.path) == (
        auth.scheme,
        auth.netloc,
        "/signup",
    )
    [back] = parse_qs(address.query)["returnTo"]
    # The bookings app's own sign-in, which lands on the booking page; auth only
    # redirects to an origin on its return-host allow-list (the bookings one is).
    bookings = urlsplit(auth_settings.BOOKINGS_APP_URL)
    target = urlsplit(back)
    assert (target.scheme, target.netloc, target.path) == (
        bookings.scheme,
        bookings.netloc,
        "/signin",
    )
    assert parse_qs(target.query) == {"returnTo": ["/sea-salt-spa"]}


def test_the_api_and_the_web_apps_name_the_same_auth_address() -> None:
    """The mail (AUTH_FRONTEND_URL) and the booking page (AUTH_APP_URL) must send
    people to the same auth app. Both are set in the deploy compose file."""
    compose = (
        Path(__file__).parents[5] / "infra" / "docker" / "docker-compose.deploy.yml"
    )
    if not compose.exists():
        pytest.skip("deploy compose file not in this checkout")
    text = compose.read_text()
    frontend = set(re.findall(r"^\s+AUTH_FRONTEND_URL:\s*(\S+)", text, re.M))
    app = set(re.findall(r"^\s+AUTH_APP_URL:\s*(\S+)", text, re.M))
    assert len(frontend) == 1, frontend
    assert frontend == app


def test_the_invitation_is_part_of_the_received_confirmed_and_reminder_mails_only() -> (
    None
):
    mail = emails.BookingEmail(
        business="Babydoll Beauty Bar",
        customer_name="Ada",
        service_name="Classic full set",
        provider_name="Jeriann",
        starts_at=datetime(2027, 1, 5, 13, 30),
        tz=zone("America/Grenada"),
        account_invite_url="https://auth.example.test/signup",
    )
    for built in (
        emails.customer_received(mail, confirmed=False),
        emails.customer_received(mail, confirmed=True),
        emails.customer_confirmed(mail),
        emails.customer_reminder(mail, confirmed=True),
        emails.customer_reminder(mail, confirmed=False),
    ):
        html = card_html(built)
        assert 'href="https://auth.example.test/signup"' in html
        assert "Booking never needs an account" in html
        assert "listed under My bookings" in html
    for other in (
        card_html(emails.customer_cancelled(mail)),
        card_html(emails.customer_rescheduled(mail)),
        card_html(emails.customer_rescheduled_by_studio(mail)),
    ):
        assert INVITE not in other
    plain = emails.BookingEmail(**{**mail.__dict__, "account_invite_url": None})
    assert INVITE not in card_html(emails.customer_received(plain, confirmed=True))


async def test_a_guest_booking_mails_carry_the_invitation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, requires_confirmation=True)
    slots = await _slots(async_client, studio)
    response = await _book(async_client, studio, slots[0])
    assert response.status_code == 201, response.text
    booking_id = response.json()["booking"]["id"]

    received = await _mail(db_async, studio, booking_id, "booking-confirmation")
    assert f'href="{_href(studio.slug)}"' in received
    assert "Booking never needs an account" in received

    confirm = await async_client.post(
        f"{API}/org/bookings/{booking_id}/confirm", headers=studio.headers
    )
    assert confirm.status_code == 200, confirm.text
    confirmed = await _mail(db_async, studio, booking_id, "booking-confirmed")
    assert f'href="{_href(studio.slug)}"' in confirmed


async def test_a_booking_linked_to_an_account_gets_no_invitation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    account = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    response = await _signed_in_book(
        async_client, studio, headers_for(account), customer_email=account.email
    )
    assert response.status_code == 201, response.text
    booking_id = response.json()["booking"]["id"]
    html = await _mail(db_async, studio, booking_id, "booking-confirmation")
    assert INVITE not in html
    assert "/signup" not in html


async def test_a_signed_in_booking_under_another_email_is_still_invited(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The account's email is not the booking's, so nothing is linked and the
    # mail says "with this email address" truthfully.
    studio = await _studio(db_async, async_client)
    account = await make_user(
        db_async, email=f"mine-{uuid.uuid4().hex[:6]}@example.com"
    )
    response = await _signed_in_book(
        async_client,
        studio,
        headers_for(account),
        customer_email=f"other-{uuid.uuid4().hex[:6]}@example.com",
    )
    assert response.status_code == 201, response.text
    html = await _mail(
        db_async, studio, response.json()["booking"]["id"], "booking-confirmation"
    )
    assert f'href="{_href(studio.slug)}"' in html


async def test_an_earlier_guest_booking_appears_once_the_person_books_signed_in(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """What the invitation promises: the guest booking is listed after a signed-in
    booking with the same verified email at the same business; not before."""
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    account = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    headers = headers_for(account)

    guest = await _book(async_client, studio, slots[0], customer_email=account.email)
    assert guest.status_code == 201, guest.text
    guest_id = guest.json()["booking"]["id"]
    before = await async_client.get(f"{API}/me/bookings", headers=headers)
    assert before.json()["count"] == 0

    signed_in = await _signed_in_book(
        async_client, studio, headers, slot=-1, customer_email=account.email
    )
    assert signed_in.status_code == 201, signed_in.text
    after = await async_client.get(f"{API}/me/bookings", headers=headers)
    listed = {row["id"] for row in after.json()["data"]}
    assert listed == {guest_id, signed_in.json()["booking"]["id"]}
