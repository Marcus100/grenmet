"""Services for new clients only (#1863): the public create refuses a returning
client (a confirmed or completed booking with the business, matched through the
contact rules, ADR-0058); staff bookings are never refused; the lead time rule is
informational and shown on the storefront and the booking."""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import BookingStatus
from tests.bookings.booking_day import MONDAY, utc_iso
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _booking_for,
    _slots,
    _studio,
)

MESSAGE = (
    "This service is for new clients only. "
    "Please choose another service or contact the business."
)


def _email() -> str:
    return f"new-{uuid.uuid4().hex[:8]}@example.com"


async def _patch(
    client: httpx.AsyncClient, studio: Studio, **fields: object
) -> httpx.Response:
    return await client.patch(
        f"{API}/org/services/{studio.service_id}", headers=studio.headers, json=fields
    )


async def _book_first_free(
    client: httpx.AsyncClient, studio: Studio, email: str
) -> httpx.Response:
    slots = await _slots(client, studio)
    return await _book(client, studio, slots[0], customer_email=email)


async def _flag_on(client: httpx.AsyncClient, studio: Studio, **extra: object) -> None:
    response = await _patch(client, studio, new_clients_only=True, **extra)
    assert response.status_code == 200, response.text


async def test_a_new_customer_books_a_new_clients_only_service(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    await _flag_on(async_client, studio)
    response = await _book_first_free(async_client, studio, _email())
    assert response.status_code == 201, response.text


async def test_a_returning_customer_with_a_confirmed_booking_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    email = _email()
    first = await _book_first_free(async_client, studio, email)
    assert first.status_code == 201, first.text
    await _flag_on(async_client, studio)

    # Same person, address in another case: the contact rules match them.
    refused = await _book_first_free(async_client, studio, email.upper())
    assert refused.status_code == 409, refused.text
    body = refused.json()
    assert MESSAGE in refused.text
    assert "NEW_CLIENTS_ONLY" in refused.text, body
    # Nothing stored for the refused attempt.
    other = await _book_first_free(async_client, studio, _email())
    assert other.status_code == 201, other.text


async def test_a_returning_customer_with_a_completed_booking_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    email = _email()
    first = await _book_first_free(async_client, studio, email)
    assert first.status_code == 201, first.text
    booking = await _booking_for(db_async, first.json()["booking"]["id"])
    booking.status = BookingStatus.COMPLETED.value
    await db_async.commit()
    await _flag_on(async_client, studio)

    refused = await _book_first_free(async_client, studio, email)
    assert refused.status_code == 409, refused.text
    assert "NEW_CLIENTS_ONLY" in refused.text


async def test_only_cancelled_bookings_leave_a_customer_new(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    email = _email()
    first = await _book_first_free(async_client, studio, email)
    assert first.status_code == 201, first.text
    cancel = await async_client.post(
        f"{API}/public/bookings/{first.json()['manage_token']}/cancel"
    )
    assert cancel.status_code == 200, cancel.text
    await _flag_on(async_client, studio)

    again = await _book_first_free(async_client, studio, email)
    assert again.status_code == 201, again.text


async def test_a_returning_customer_can_book_a_service_open_to_everyone(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    email = _email()
    assert (await _book_first_free(async_client, studio, email)).status_code == 201
    again = await _book_first_free(async_client, studio, email)
    assert again.status_code == 201, again.text


async def test_staff_can_book_a_returning_customer(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from tests.bookings.test_studio_create import _create

    studio = await _studio(db_async, async_client, providers=2)
    email = _email()
    assert (await _book_first_free(async_client, studio, email)).status_code == 201
    await _flag_on(async_client, studio)

    response = await _create(
        async_client,
        studio,
        utc_iso(9, 30, day=MONDAY + timedelta(days=7)),
        customer_email=email,
    )
    assert response.status_code == 201, response.text


async def test_fields_are_kept_when_a_patch_leaves_them_out(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    await _flag_on(
        async_client,
        studio,
        first_visit_lead_days=2,
        first_visit_categories=["Lashes", "Facials", "Lashes"],
    )
    other = await _patch(async_client, studio, description="Includes a patch test")
    assert other.status_code == 200, other.text
    body = other.json()
    assert body["new_clients_only"] is True
    assert body["first_visit_lead_days"] == 2
    assert body["first_visit_categories"] == ["Lashes", "Facials"]


async def test_the_lead_time_is_dropped_when_the_service_is_open_to_everyone(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    await _flag_on(
        async_client, studio, first_visit_lead_days=2, first_visit_categories=["Lashes"]
    )
    off = await _patch(async_client, studio, new_clients_only=False)
    assert off.status_code == 200, off.text
    body = off.json()
    assert body["new_clients_only"] is False
    assert body["first_visit_lead_days"] is None
    assert body["first_visit_categories"] is None


async def test_the_storefront_and_the_booking_expose_the_rule(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    await _flag_on(
        async_client, studio, first_visit_lead_days=2, first_visit_categories=["Lashes"]
    )
    page = await async_client.get(f"{API}/public/{studio.slug}")
    assert page.status_code == 200, page.text
    (svc,) = [s for s in page.json()["services"] if s["id"] == studio.service_id]
    assert svc["new_clients_only"] is True
    assert svc["first_visit_lead_days"] == 2
    assert svc["first_visit_categories"] == ["Lashes"]

    booked = await _book_first_free(async_client, studio, _email())
    assert booked.status_code == 201, booked.text
    detail = booked.json()["booking"]
    assert detail["new_clients_only"] is True
    assert detail["first_visit_lead_days"] == 2
    assert detail["first_visit_categories"] == ["Lashes"]


async def test_a_service_defaults_to_open_to_everyone(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    page = await async_client.get(f"{API}/public/{studio.slug}")
    (svc,) = [s for s in page.json()["services"] if s["id"] == studio.service_id]
    assert svc["new_clients_only"] is False
    assert svc["first_visit_lead_days"] is None


@pytest.mark.parametrize(
    "fields",
    [
        {"first_visit_lead_days": -1},
        {"first_visit_lead_days": 61},
        {"first_visit_categories": [""]},
        {"first_visit_categories": ["x" * 81]},
        {"first_visit_categories": [f"c{i}" for i in range(21)]},
    ],
)
async def test_values_out_of_bounds_are_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient, fields: dict
) -> None:
    studio = await _studio(db_async, async_client)
    response = await _patch(async_client, studio, new_clients_only=True, **fields)
    assert response.status_code == 422, response.text


async def test_the_bounds_themselves_are_accepted(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    for days in (0, 60):
        response = await _patch(
            async_client, studio, new_clients_only=True, first_visit_lead_days=days
        )
        assert response.status_code == 200, response.text
        assert response.json()["first_visit_lead_days"] == days
