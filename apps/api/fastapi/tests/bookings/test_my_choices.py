"""``GET /bookings/me/businesses/{slug}/choices``: what a signed-in person's own
history with one business suggests for the next booking (ADR-0058).

Built only from bookings whose contact is linked to the caller, the same rule as
My bookings. Nobody else's bookings or phone number are ever read.
"""

import uuid
from datetime import timedelta

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.config import auth_settings
from src.auth.utils import create_access_token
from tests.bookings.test_account_link import _book_in, _signed_in_book
from tests.bookings.test_public_bookings import API, Studio, _book, _slots, _studio
from tests.events.roles import user_with_role
from tests.factories import make_user
from tests.organisations.support import headers_for


def _url(studio: Studio) -> str:
    return f"{API}/me/businesses/{studio.slug}/choices"


async def _second_service(
    client: httpx.AsyncClient, studio: Studio, name: str = "Lash lift"
) -> str:
    created = await client.post(
        f"{API}/org/services",
        headers=studio.headers,
        json={"name": name, "duration_min": 60, "price_minor": 9000},
    )
    assert created.status_code == 201, created.text
    service_id = str(created.json()["id"])
    for provider_id in studio.provider_ids:
        updated = await client.patch(
            f"{API}/org/providers/{provider_id}",
            headers=studio.headers,
            json={"service_ids": [studio.service_id, service_id]},
        )
        assert updated.status_code == 200, updated.text
    return service_id


async def _book_service(
    client: httpx.AsyncClient,
    studio: Studio,
    account_headers: dict[str, str],
    service_id: str,
    *,
    email: str,
    slot: int,
) -> httpx.Response:
    slots = await client.get(
        f"{API}/public/{studio.slug}/availability",
        params={"service_id": service_id, "first_day": _day(), "last_day": _day()},
    )
    starts = [s["starts_at"] for s in slots.json()["slots"]]
    return await client.post(
        f"{API}/public/{studio.slug}/bookings",
        headers={**account_headers, "Idempotency-Key": uuid.uuid4().hex},
        json={
            "service_id": service_id,
            "starts_at": starts[slot],
            "customer_name": "Ada Lovelace",
            "customer_email": email,
            "customer_phone": "+1 473 555 0111",
        },
    )


def _day() -> str:
    from tests.bookings.booking_day import DAY

    return str(DAY)


async def test_a_person_with_no_history_gets_nothing_recent(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"new-{uuid.uuid4().hex[:6]}@example.com")
    response = await async_client.get(_url(studio), headers=headers_for(ada))
    assert response.status_code == 200, response.text
    assert response.json() == {"phone": None, "recent": []}


async def test_history_lists_the_latest_provider_per_service_most_recent_first(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    other_service = await _second_service(async_client, studio)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    headers = headers_for(ada)
    first = await _signed_in_book(
        async_client, studio, headers, slot=0, customer_email=ada.email
    )
    assert first.status_code == 201, first.text
    second = await _book_service(
        async_client, studio, headers, other_service, email=ada.email, slot=-1
    )
    assert second.status_code == 201, second.text

    response = await async_client.get(_url(studio), headers=headers)
    assert response.status_code == 200, response.text
    recent = response.json()["recent"]
    # Two distinct services, each with the provider used for it; the second
    # booking (later in the day) is first.
    assert [row["service_id"] for row in recent] == [other_service, studio.service_id]
    assert recent[0]["provider_id"] == second.json()["booking"]["provider_id"]
    assert recent[1]["provider_id"] == first.json()["booking"]["provider_id"]
    # The business keeps the phone number it first recorded for the contact.
    assert response.json()["phone"] == "+1 473 555 0100"


async def test_a_cancelled_booking_is_not_suggested(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    booked = await _signed_in_book(
        async_client, studio, headers_for(ada), customer_email=ada.email
    )
    assert booked.status_code == 201, booked.text
    cancelled = await async_client.post(
        f"{API}/public/bookings/{booked.json()['manage_token']}/cancel"
    )
    assert cancelled.status_code == 200, cancelled.text
    response = await async_client.get(_url(studio), headers=headers_for(ada))
    assert response.json()["recent"] == []


async def test_only_the_callers_own_linked_history_is_shown(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    other_service = await _second_service(async_client, studio)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    bob = await make_user(db_async, email=f"bob-{uuid.uuid4().hex[:6]}@example.com")
    # Bob's booking (a different service, his own phone) and a guest booking made
    # with Ada's email but never linked to her account.
    bobs = await _book_service(
        async_client,
        studio,
        headers_for(bob),
        other_service,
        email=bob.email,
        slot=0,
    )
    assert bobs.status_code == 201, bobs.text
    slots = await _slots(async_client, studio)
    guest = await _book(async_client, studio, slots[-1], customer_email=ada.email)
    assert guest.status_code == 201, guest.text

    ada_view = await async_client.get(_url(studio), headers=headers_for(ada))
    assert ada_view.status_code == 200, ada_view.text
    assert ada_view.json() == {"phone": None, "recent": []}
    bob_view = await async_client.get(_url(studio), headers=headers_for(bob))
    assert [row["service_id"] for row in bob_view.json()["recent"]] == [other_service]


async def test_history_with_another_business_is_not_shown(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    here = await _studio(db_async, async_client)
    there = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    await _book_in(async_client, there, ada, slot=0)
    response = await async_client.get(_url(here), headers=headers_for(ada))
    assert response.json()["recent"] == []
    # Nor the phone number the other business holds: here there is none at all.
    assert response.json()["phone"] is None
    elsewhere = await async_client.get(_url(there), headers=headers_for(ada))
    assert len(elsewhere.json()["recent"]) == 1


async def test_at_most_three_services_are_suggested(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # Four bookings for one customer: the open-request cap (default 3) is raised.
    studio = await _studio(db_async, async_client, max_open_per_customer=10)
    extra = [
        await _second_service(async_client, studio, f"Extra {n}") for n in range(3)
    ]
    # `_second_service` replaces the provider's list each time, so offer all.
    for provider_id in studio.provider_ids:
        updated = await async_client.patch(
            f"{API}/org/providers/{provider_id}",
            headers=studio.headers,
            json={"service_ids": [studio.service_id, *extra]},
        )
        assert updated.status_code == 200, updated.text
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    headers = headers_for(ada)
    booked = await _signed_in_book(
        async_client, studio, headers, slot=0, customer_email=ada.email
    )
    assert booked.status_code == 201, booked.text
    for service_id in extra:
        response = await _book_service(
            async_client, studio, headers, service_id, email=ada.email, slot=0
        )
        assert response.status_code == 201, response.text
    recent = (await async_client.get(_url(studio), headers=headers)).json()["recent"]
    assert len(recent) == 3


async def test_the_account_phone_is_the_fallback(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    ada.phone_e164 = f"+1473555{uuid.uuid4().int % 10000:04d}"
    await db_async.commit()
    phone = ada.phone_e164
    response = await async_client.get(_url(studio), headers=headers_for(ada))
    assert response.json() == {"phone": phone, "recent": []}


async def test_the_bookings_app_session_may_ask_and_a_stranger_may_not(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    member = await user_with_role(db_async, "bookings-member")
    token = create_access_token(
        member.id,
        expires_delta=timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app="bookings",
    )
    allowed = await async_client.get(
        _url(studio), headers={"Authorization": f"Bearer {token}"}
    )
    assert allowed.status_code == 200, allowed.text
    other = create_access_token(
        member.id,
        expires_delta=timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app="gms",
    )
    refused = await async_client.get(
        _url(studio), headers={"Authorization": f"Bearer {other}"}
    )
    assert refused.status_code == 401, refused.text
    assert (await async_client.get(_url(studio))).status_code == 401


async def test_an_unknown_business_is_the_public_404(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    response = await async_client.get(
        f"{API}/me/businesses/nobody-here/choices", headers=headers_for(ada)
    )
    assert response.status_code == 404


async def test_declined_and_no_show_bookings_are_not_suggested(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """A declined request and an expired unpaid hold are both ``cancelled``; a
    no-show is its own status. None of them says what the person wants again."""
    studio = await _studio(db_async, async_client, requires_confirmation=True)
    other_service = await _second_service(async_client, studio)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    headers = headers_for(ada)
    first = await _signed_in_book(
        async_client, studio, headers, slot=0, customer_email=ada.email
    )
    second = await _book_service(
        async_client, studio, headers, other_service, email=ada.email, slot=-1
    )
    assert first.status_code == second.status_code == 201
    first_id = first.json()["booking"]["id"]
    second_id = second.json()["booking"]["id"]

    # Pending requests count: the person did ask for them.
    pending = await async_client.get(_url(studio), headers=headers)
    assert len(pending.json()["recent"]) == 2

    declined = await async_client.post(
        f"{API}/org/bookings/{first_id}/decline",
        headers=studio.headers,
        json={"reason": "Fully booked"},
    )
    assert declined.status_code == 200, declined.text
    confirmed = await async_client.post(
        f"{API}/org/bookings/{second_id}/confirm", headers=studio.headers
    )
    assert confirmed.status_code == 200, confirmed.text
    missed = await async_client.post(
        f"{API}/org/bookings/{second_id}/no-show", headers=studio.headers
    )
    assert missed.status_code == 200, missed.text

    response = await async_client.get(_url(studio), headers=headers)
    assert response.json()["recent"] == []


async def test_a_completed_booking_is_suggested(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    booked = await _signed_in_book(
        async_client, studio, headers_for(ada), customer_email=ada.email
    )
    booking_id = booked.json()["booking"]["id"]
    done = await async_client.post(
        f"{API}/org/bookings/{booking_id}/complete", headers=studio.headers
    )
    assert done.status_code == 200, done.text
    response = await async_client.get(_url(studio), headers=headers_for(ada))
    assert [row["service_id"] for row in response.json()["recent"]] == [
        studio.service_id
    ]
