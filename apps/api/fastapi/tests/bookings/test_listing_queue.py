"""Barrels staff list business listings by review state (ADR-0066 item 4).

``GET /bookings/admin/listing-reviews`` needs ``bookings.listing.approve``. The
default ``pending`` queue lists businesses that asked for the home page listing and
wait for approval, oldest business first; ``approved``, ``flagged`` (owner left, or
the sign-up name was refused for email) and ``all`` list the rest.
"""

from typing import Any

import httpx
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import BookingProfile
from src.utils.datetime import utc_now
from tests.bookings.test_public_bookings import API, Studio, _studio

URL = f"{API}/admin/listing-reviews"


async def _queue(
    client: httpx.AsyncClient, headers: dict[str, str], **params: str | int
) -> dict[str, Any]:
    response = await client.get(URL, headers=headers, params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def _ids(body: dict[str, Any]) -> list[str]:
    return [row["organisation_id"] for row in body["data"]]


async def _approve(
    client: httpx.AsyncClient, headers: dict[str, str], org: str
) -> None:
    response = await client.post(
        f"{API}/admin/businesses/{org}/listing/approve", headers=headers
    )
    assert response.status_code == 200, response.text


async def _set(db: AsyncSession, studio: Studio, **values: object) -> None:
    await db.execute(
        update(BookingProfile)
        .where(BookingProfile.organisation_id == studio.org_id)
        .values(**values)
    )
    await db.commit()


async def test_the_pending_queue_lists_listed_businesses_waiting_oldest_first(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    first = await _studio(db_async, async_client, display_name="First", listed=True)
    second = await _studio(db_async, async_client, display_name="Second", listed=True)
    await _studio(db_async, async_client, display_name="Not listed")
    approved = await _studio(db_async, async_client, display_name="Done", listed=True)
    await _approve(async_client, superuser_token_headers_async, approved.org_id)

    body = await _queue(async_client, superuser_token_headers_async)

    assert _ids(body) == [first.org_id, second.org_id]
    assert body["count"] == 2
    assert body["data"][0]["listed"] is True
    assert body["data"][0]["listing_approved_at"] is None


async def test_the_approved_queue_and_all(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    waiting = await _studio(db_async, async_client, display_name="Wait", listed=True)
    approved = await _studio(db_async, async_client, display_name="Done", listed=True)
    await _approve(async_client, superuser_token_headers_async, approved.org_id)

    done = await _queue(async_client, superuser_token_headers_async, queue="approved")
    every = await _queue(async_client, superuser_token_headers_async, queue="all")

    assert _ids(done) == [approved.org_id]
    assert done["data"][0]["listing_approved_at"] is not None
    assert set(_ids(every)) == {waiting.org_id, approved.org_id}


async def test_the_flagged_queue_lists_an_owner_who_left_and_a_refused_name(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    left = await _studio(db_async, async_client, display_name="Left")
    named = await _studio(db_async, async_client, display_name="Named")
    await _studio(db_async, async_client, display_name="Fine", listed=True)
    await _set(db_async, left, owner_left_at=utc_now())
    await _set(db_async, named, sender_name_flagged_at=utc_now())

    body = await _queue(async_client, superuser_token_headers_async, queue="flagged")

    assert set(_ids(body)) == {left.org_id, named.org_id}
    flags = {row["organisation_id"]: row for row in body["data"]}
    assert flags[left.org_id]["owner_left_at"] is not None
    assert flags[named.org_id]["sender_name_flagged_at"] is not None


async def test_the_queue_pages(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    studios = [
        await _studio(db_async, async_client, display_name=f"Shop {n}", listed=True)
        for n in range(3)
    ]

    second = await _queue(async_client, superuser_token_headers_async, page=2, size=2)

    assert _ids(second) == [studios[2].org_id]
    assert second["count"] == 3
    assert second["page"] == 2
    assert second["size"] == 2


async def test_only_staff_with_the_permission_can_list(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
) -> None:
    signed_in = await async_client.get(URL, headers=normal_user_token_headers_async)
    assert signed_in.status_code == 403
    anonymous = await async_client.get(URL)
    assert anonymous.status_code == 401


async def test_an_unknown_queue_is_422(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    response = await async_client.get(
        URL, headers=superuser_token_headers_async, params={"queue": "everything"}
    )
    assert response.status_code == 422
