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

from src.bookings.models import BookingProfile, Service
from src.organisations import service as organisation_service
from src.organisations.models import OrganisationStatus, PlatformOrganisation
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


async def test_an_approved_business_that_stopped_asking_stays_in_approved(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    studio = await _studio(db_async, async_client, display_name="Quiet", listed=True)
    await _approve(async_client, superuser_token_headers_async, studio.org_id)
    await _set(db_async, studio, listed=False)

    done = await _queue(async_client, superuser_token_headers_async, queue="approved")
    waiting = await _queue(async_client, superuser_token_headers_async)

    assert _ids(done) == [studio.org_id]
    assert _ids(waiting) == []


async def test_a_flagged_business_shows_whether_or_not_it_is_approved(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    approved = await _studio(db_async, async_client, display_name="Was ok", listed=True)
    await _approve(async_client, superuser_token_headers_async, approved.org_id)
    await _set(db_async, approved, sender_name_flagged_at=utc_now())

    body = await _queue(async_client, superuser_token_headers_async, queue="flagged")

    assert _ids(body) == [approved.org_id]
    assert body["data"][0]["listing_approved_at"] is not None


async def test_businesses_made_at_the_same_moment_page_without_repeats(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    studios = [
        await _studio(db_async, async_client, display_name=f"Twin {n}", listed=True)
        for n in range(3)
    ]
    moment = utc_now()
    await db_async.execute(
        update(PlatformOrganisation)
        .where(PlatformOrganisation.id.in_([s.org_id for s in studios]))
        .values(created_at=moment)
    )
    await db_async.commit()

    pages = [
        _ids(await _queue(async_client, superuser_token_headers_async, page=n, size=1))
        for n in (1, 2, 3)
    ]

    seen = [org for page in pages for org in page]
    assert sorted(seen) == sorted(s.org_id for s in studios)


# --- whether an approved business is really on the home page (#1951) ------------------


def _row(body: dict[str, Any], org: str) -> dict[str, Any]:
    return next(row for row in body["data"] if row["organisation_id"] == org)


async def _on_home_page(client: httpx.AsyncClient, studio: Studio) -> bool:
    """Whether the public home page list shows the business."""
    response = await client.get(f"{API}/public/businesses")
    assert response.status_code == 200, response.text
    return studio.slug in {card["slug"] for card in response.json()["items"]}


async def test_an_approved_listed_business_is_on_the_home_page(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    shown = await _studio(db_async, async_client, display_name="Shown", listed=True)
    await _approve(async_client, superuser_token_headers_async, shown.org_id)

    body = await _queue(async_client, superuser_token_headers_async, queue="approved")

    row = _row(body, shown.org_id)
    assert row["on_home_page"] is True
    assert row["not_shown_reasons"] == []
    assert await _on_home_page(async_client, shown) is True


async def test_an_approved_business_with_its_own_switch_off_is_not_on_the_home_page(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    hidden = await _studio(db_async, async_client, display_name="Hidden", listed=True)
    await _approve(async_client, superuser_token_headers_async, hidden.org_id)
    await _set(db_async, hidden, listed=False)

    body = await _queue(async_client, superuser_token_headers_async, queue="approved")

    row = _row(body, hidden.org_id)
    assert row["listing_approved_at"] is not None
    assert row["on_home_page"] is False
    assert row["not_shown_reasons"] == ["not_listed"]
    assert await _on_home_page(async_client, hidden) is False


async def test_each_reason_a_business_is_not_shown_is_named(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    """One business per failed condition, beside a shown one, so a reason never leaks
    from another organisation's services, entitlement or status."""
    shown = await _studio(db_async, async_client, display_name="Shown", listed=True)
    waiting = await _studio(db_async, async_client, display_name="Wait", listed=True)
    closed = await _studio(db_async, async_client, display_name="Closed", listed=True)
    paused = await _studio(db_async, async_client, display_name="Paused", listed=True)
    empty = await _studio(db_async, async_client, display_name="Empty", listed=True)
    lapsed = await _studio(db_async, async_client, display_name="Lapsed", listed=True)
    gone = await _studio(db_async, async_client, display_name="Gone", listed=True)
    for studio in (shown, closed, paused, empty, lapsed, gone):
        await _approve(async_client, superuser_token_headers_async, studio.org_id)
    await _set(db_async, closed, enabled=False)
    await _set(db_async, paused, paused_at=utc_now())
    await db_async.execute(
        update(Service)
        .where(Service.organisation_id == empty.org_id)
        .values(active=False)
    )
    await organisation_service.set_app_enabled(
        db_async, organisation_id=lapsed.org_id, app_key="bookings", enabled=False
    )
    await db_async.execute(
        update(PlatformOrganisation)
        .where(PlatformOrganisation.id == gone.org_id)
        .values(status=OrganisationStatus.SUSPENDED.value)
    )
    await db_async.commit()

    body = await _queue(async_client, superuser_token_headers_async, queue="all")

    reasons = {row["organisation_id"]: row["not_shown_reasons"] for row in body["data"]}
    assert reasons[shown.org_id] == []
    assert reasons[waiting.org_id] == ["not_approved"]
    assert reasons[closed.org_id] == ["booking_closed"]
    assert reasons[paused.org_id] == ["paused"]
    assert reasons[empty.org_id] == ["no_active_service"]
    assert reasons[lapsed.org_id] == ["not_entitled"]
    assert reasons[gone.org_id] == ["organisation_inactive"]
    for studio in (shown, waiting, closed, paused, empty, lapsed, gone):
        row = _row(body, studio.org_id)
        assert row["on_home_page"] is (studio is shown)
        assert await _on_home_page(async_client, studio) is (studio is shown)


async def test_every_missing_condition_is_listed_together(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    never = await _studio(db_async, async_client, display_name="Never", enabled=False)

    body = await _queue(async_client, superuser_token_headers_async, queue="all")

    assert _row(body, never.org_id)["not_shown_reasons"] == [
        "not_listed",
        "not_approved",
        "booking_closed",
    ]


async def test_approving_and_withdrawing_return_the_new_home_page_state(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
) -> None:
    studio = await _studio(db_async, async_client, display_name="Flip", listed=True)
    base = f"{API}/admin/businesses/{studio.org_id}/listing"

    before = await async_client.get(base, headers=superuser_token_headers_async)
    approved = await async_client.post(
        f"{base}/approve", headers=superuser_token_headers_async
    )
    withdrawn = await async_client.post(
        f"{base}/withdraw", headers=superuser_token_headers_async
    )

    assert before.json()["not_shown_reasons"] == ["not_approved"]
    assert approved.json()["on_home_page"] is True
    assert approved.json()["not_shown_reasons"] == []
    assert withdrawn.json()["on_home_page"] is False
    assert withdrawn.json()["not_shown_reasons"] == ["not_approved"]
