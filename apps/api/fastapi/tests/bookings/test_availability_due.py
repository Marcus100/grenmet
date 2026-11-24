"""The amount due at booking and the emailed-code rule on the public availability
endpoint. They are priced on the combined price with the chosen add-ons, the same
way ``create_booking`` prices a booking, so the storefront can show the real figure."""

import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import deposit_payments
from src.bookings.models import BookingPaymentMode
from tests.bookings.booking_day import DAY
from tests.bookings.email_code_helpers import get_proof
from tests.bookings.test_add_ons import ADD_ON_PRICE, PRICE, _addon
from tests.bookings.test_public_bookings import API, Studio, _book, _studio


async def _due(
    client: httpx.AsyncClient, studio: Studio, add_on_ids: list[str] | None = None
) -> httpx.Response:
    return await client.get(
        f"{API}/public/{studio.slug}/availability",
        params={
            "service_id": studio.service_id,
            "first_day": DAY,
            "last_day": DAY,
            "add_on_ids": add_on_ids or [],
        },
    )


async def _quote(
    client: httpx.AsyncClient, studio: Studio, add_on_ids: list[str] | None = None
) -> dict[str, object]:
    response = await _due(client, studio, add_on_ids)
    assert response.status_code == 200, response.text
    body = response.json()
    return {
        "due": body["due_at_booking_minor"],
        "required": body["email_code_required"],
    }


async def _set_service(
    client: httpx.AsyncClient, studio: Studio, **body: object
) -> None:
    response = await client.patch(
        f"{API}/org/services/{studio.service_id}", headers=studio.headers, json=body
    )
    assert response.status_code == 200, response.text


async def test_a_service_deposit_is_the_same_with_or_without_add_ons(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async, async_client, apps=("bookings", "payments"), add_ons_enabled=True
    )
    await _set_service(async_client, studio, deposit_minor=5000)
    addon = await _addon(async_client, studio)
    assert await _quote(async_client, studio) == {"due": 5000, "required": True}
    assert await _quote(async_client, studio, [addon]) == {
        "due": 5000,
        "required": True,
    }


async def test_a_percent_rule_is_applied_to_the_combined_price(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """EC$100 service and an EC$50 add-on at 30% charge EC$45, not EC$30."""
    studio = await _studio(
        db_async,
        async_client,
        apps=("bookings", "payments"),
        add_ons_enabled=True,
        deposit_mode="percent",
        deposit_percent=30,
    )
    await _set_service(async_client, studio, price_minor=10000)
    addon = await _addon(async_client, studio, price_minor=5000)
    assert await _quote(async_client, studio) == {"due": 3000, "required": True}
    assert await _quote(async_client, studio, [addon]) == {
        "due": 4500,
        "required": True,
    }


async def test_full_price_mode_charges_the_combined_price(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(deposit_payments, "stripe_available", lambda: True)
    studio = await _studio(
        db_async,
        async_client,
        apps=("bookings", "payments"),
        add_ons_enabled=True,
        payment_at_booking=BookingPaymentMode.FULL_PRICE.value,
    )
    addon = await _addon(async_client, studio)
    assert await _quote(async_client, studio, [addon]) == {
        "due": PRICE + ADD_ON_PRICE,
        "required": True,
    }
    assert await _quote(async_client, studio) == {"due": PRICE, "required": True}


async def test_an_add_on_can_cross_the_deposit_minimum(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """The main service is under the minimum alone; with the add-on it crosses it."""
    studio = await _studio(
        db_async,
        async_client,
        apps=("bookings", "payments"),
        add_ons_enabled=True,
        deposit_mode="percent",
        deposit_percent=50,
        deposit_min_price_minor=PRICE + ADD_ON_PRICE,
    )
    addon = await _addon(async_client, studio)
    assert await _quote(async_client, studio) == {"due": 0, "required": False}
    assert await _quote(async_client, studio, [addon]) == {
        "due": (PRICE + ADD_ON_PRICE) // 2,
        "required": True,
    }


async def test_the_minimum_crossed_by_an_add_on_asks_for_the_code_at_create(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """The code request must price the add-on too, or the step is never asked."""
    studio = await _studio(
        db_async,
        async_client,
        apps=("bookings", "payments"),
        add_ons_enabled=True,
        deposit_mode="percent",
        deposit_percent=50,
        deposit_min_price_minor=PRICE + ADD_ON_PRICE,
    )
    addon = await _addon(async_client, studio)
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    slot = (await _due(async_client, studio, [addon])).json()["slots"][0]["starts_at"]
    body = {
        "service_id": studio.service_id,
        "starts_at": slot,
        "customer_email": email,
    }
    alone = await async_client.post(f"{API}/public/{studio.slug}/email-code", json=body)
    assert alone.json()["required"] is False
    with_addon = await async_client.post(
        f"{API}/public/{studio.slug}/email-code", json={**body, "add_on_ids": [addon]}
    )
    assert with_addon.json()["required"] is True
    refused = await _book(
        async_client, studio, slot, add_on_ids=[addon], customer_email=email
    )
    assert refused.status_code == 403, refused.text
    assert refused.json()["detail"].startswith("email_verification_required")


async def test_the_quote_is_what_create_charges(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async,
        async_client,
        apps=("bookings", "payments"),
        add_ons_enabled=True,
        deposit_mode="percent",
        deposit_percent=50,
    )
    addon = await _addon(async_client, studio)
    response = await _due(async_client, studio, [addon])
    quoted = response.json()["due_at_booking_minor"]
    slot = response.json()["slots"][0]["starts_at"]
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    proof = await get_proof(db_async, async_client, studio, slot, email)
    booked = await _book(
        async_client,
        studio,
        slot,
        add_on_ids=[addon],
        customer_email=email,
        email_proof=proof,
    )
    assert booked.status_code == 201, booked.text
    assert booked.json()["booking"]["deposit_minor"] == quoted == 12000


async def test_nothing_due_is_zero_and_no_code(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    addon = await _addon(async_client, studio)
    assert await _quote(async_client, studio) == {"due": 0, "required": False}
    assert await _quote(async_client, studio, [addon]) == {
        "due": 0,
        "required": False,
    }


async def test_add_ons_off_is_refused_as_before(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    response = await _due(async_client, studio, [str(uuid.uuid4())])
    assert response.status_code == 422, response.text
