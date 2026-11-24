"""Add-on safety: a service with upcoming bookings cannot become an add-on (so
customers can still reschedule them), and the add-ons mail row is escaped."""

from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import emails
from tests.bookings.test_add_ons import _service, _slots_with
from tests.bookings.test_public_bookings import API, _book, _studio
from tests.email_payload import card_html


async def test_a_service_with_upcoming_bookings_cannot_become_an_add_on(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    slot = (await _slots_with(async_client, studio, []))[0]
    booked = await _book(async_client, studio, slot["starts_at"])
    assert booked.status_code == 201, booked.text

    refused = await async_client.patch(
        f"{API}/org/services/{studio.service_id}",
        headers=studio.headers,
        json={"is_add_on": True},
    )
    assert refused.status_code == 409, refused.text
    assert "upcoming bookings" in refused.json()["detail"]

    # The service is still bookable: the customer can still move the booking.
    still = await _slots_with(async_client, studio, [])
    assert still


async def test_a_service_without_upcoming_bookings_can_become_an_add_on(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    extra = await _service(
        async_client, studio, name="Chin wax", duration_min=10, price_minor=1500
    )
    changed = await async_client.patch(
        f"{API}/org/services/{extra}", headers=studio.headers, json={"is_add_on": True}
    )
    assert changed.status_code == 200, changed.text
    assert changed.json()["is_add_on"] is True


def test_the_add_ons_row_is_html_escaped() -> None:
    mail = emails.BookingEmail(
        business="Business",
        customer_name="Ada",
        service_name="Facial",
        provider_name="Provider",
        starts_at=datetime(2027, 1, 4, 13, 30),
        tz=ZoneInfo("America/Grenada"),
        add_ons=("<img src=x onerror=alert(1)>",),
    )
    html = card_html(emails.customer_received(mail, confirmed=True))
    assert "Add-ons" in html
    assert "<img src=x" not in html
    assert "&lt;img src=x onerror=alert(1)&gt;" in html
