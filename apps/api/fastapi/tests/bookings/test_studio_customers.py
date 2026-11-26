"""``GET /bookings/org/customers``: the studio's customers list."""

import uuid
from datetime import timedelta
from typing import Any

import httpx
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Booking, Customer
from src.contacts.models import Contact
from src.utils.datetime import utc_now
from tests.bookings.test_public_bookings import API, Studio, _book, _slots, _studio
from tests.bookings.test_studio import _key
from tests.factories import make_user
from tests.organisations.support import headers_for

URL = f"{API}/org/customers"


def _email(name: str) -> str:
    return f"{name}-{uuid.uuid4().hex[:8]}@example.com"


async def _booking(
    client: httpx.AsyncClient,
    studio: Studio,
    *,
    name: str,
    email: str,
    phone: str = "+1 473 555 0100",
) -> str:
    """Book the next free slot for this person and return the booking id."""
    starts_at = (await _slots(client, studio))[0]
    response = await _book(
        client,
        studio,
        starts_at,
        customer_name=name,
        customer_email=email,
        customer_phone=phone,
    )
    assert response.status_code == 201, response.text
    return str(response.json()["booking"]["id"])


async def _move_to_past(db: AsyncSession, booking_id: str, days: int = 400) -> None:
    shift = timedelta(days=days)
    await db.execute(
        update(Booking)
        .where(Booking.id == uuid.UUID(booking_id))
        .values(
            starts_at=Booking.starts_at - shift,
            ends_at=Booking.ends_at - shift,
            blocked_from=Booking.blocked_from - shift,
            blocked_until=Booking.blocked_until - shift,
        )
    )
    await db.commit()


async def _set_status(db: AsyncSession, booking_id: str, status: str) -> None:
    await db.execute(
        update(Booking).where(Booking.id == uuid.UUID(booking_id)).values(status=status)
    )
    await db.commit()


async def _list(
    client: httpx.AsyncClient, studio: Studio, **params: object
) -> dict[str, Any]:
    response = await client.get(URL, headers=studio.headers, params=params)
    assert response.status_code == 200, response.text
    body: dict[str, Any] = response.json()
    return body


def _names(body: dict[str, Any]) -> list[str]:
    return [row["name"] for row in body["customers"]]


async def test_repeat_customer_is_one_row_with_its_booking_facts(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    ada = _email("ada")
    first = await _booking(async_client, studio, name="Ada Lovelace", email=ada)
    second = await _booking(async_client, studio, name="Ada Lovelace", email=ada)
    await _booking(
        async_client, studio, name="Grace Hopper", email=_email("grace"), phone=""
    )
    await _move_to_past(db_async, first)

    body = await _list(async_client, studio)
    assert body["total"] == 2
    assert body["limit"] == 50
    assert body["offset"] == 0
    rows = {row["name"]: row for row in body["customers"]}
    assert set(rows) == {"Ada Lovelace", "Grace Hopper"}

    row = rows["Ada Lovelace"]
    assert set(row) == {
        "id",
        "name",
        "email",
        "phone",
        "bookings_count",
        "last_visit_at",
        "next_booking_at",
        "returning",
    }
    assert row["email"] == ada
    assert row["phone"] == "+1 473 555 0100"
    assert row["bookings_count"] == 2
    assert row["returning"] is True
    past = await db_async.get(Booking, uuid.UUID(first))
    upcoming = await db_async.get(Booking, uuid.UUID(second))
    assert past is not None
    assert upcoming is not None
    assert row["last_visit_at"] == past.starts_at.isoformat() + "Z"
    assert row["next_booking_at"] == upcoming.starts_at.isoformat() + "Z"
    assert row["id"] == str(past.customer_id) == str(upcoming.customer_id)

    grace = rows["Grace Hopper"]
    assert grace["bookings_count"] == 1
    assert grace["returning"] is False
    assert grace["last_visit_at"] is None
    assert grace["next_booking_at"] is not None


async def test_cancelled_bookings_and_no_shows_are_not_visits(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    ada = _email("ada")
    kept = await _booking(async_client, studio, name="Ada Lovelace", email=ada)
    cancelled = await _booking(async_client, studio, name="Ada Lovelace", email=ada)
    missed = await _booking(async_client, studio, name="Ada Lovelace", email=ada)
    only_cancelled = await _booking(
        async_client, studio, name="Grace Hopper", email=_email("grace")
    )
    await _set_status(db_async, cancelled, "cancelled")
    await _set_status(db_async, only_cancelled, "cancelled")
    await _set_status(db_async, missed, "no_show")
    await _move_to_past(db_async, missed, days=300)
    await _move_to_past(db_async, kept, days=400)
    await _set_status(db_async, kept, "completed")

    body = await _list(async_client, studio)
    assert _names(body) == ["Ada Lovelace"]
    row = body["customers"][0]
    assert row["bookings_count"] == 2
    visit = await db_async.get(Booking, uuid.UUID(kept))
    assert visit is not None
    assert row["last_visit_at"] == visit.starts_at.isoformat() + "Z"
    assert row["next_booking_at"] is None


async def test_upcoming_first_then_most_recent_visit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    long_ago = await _booking(
        async_client, studio, name="Long Ago", email=_email("long")
    )
    recent = await _booking(async_client, studio, name="Recent", email=_email("recent"))
    await _move_to_past(db_async, long_ago, days=400)
    await _move_to_past(db_async, recent, days=100)
    await _booking(async_client, studio, name="Soonest", email=_email("soon"))
    await _booking(async_client, studio, name="Later", email=_email("later"))

    body = await _list(async_client, studio)
    assert _names(body) == ["Soonest", "Later", "Recent", "Long Ago"]


async def test_search_matches_name_email_and_phone(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    ada = _email("ada")
    await _booking(
        async_client, studio, name="Ada Lovelace", email=ada, phone="+1 473 555 0100"
    )
    await _booking(
        async_client,
        studio,
        name="Grace Hopper",
        email=_email("grace"),
        phone="+1 473 444 0199",
    )

    assert _names(await _list(async_client, studio, q="lOVEl")) == ["Ada Lovelace"]
    assert _names(await _list(async_client, studio, q=ada.upper())) == ["Ada Lovelace"]
    assert _names(await _list(async_client, studio, q="grace-")) == ["Grace Hopper"]
    assert _names(await _list(async_client, studio, q="444 0199")) == ["Grace Hopper"]
    assert _names(await _list(async_client, studio, q="4735550100")) == ["Ada Lovelace"]
    assert _names(await _list(async_client, studio, q="  ")) == [
        "Ada Lovelace",
        "Grace Hopper",
    ]
    nobody = await _list(async_client, studio, q="%")
    assert nobody["total"] == 0
    assert nobody["customers"] == []
    assert (await _list(async_client, studio, q="_da"))["total"] == 0


async def test_pages_with_limit_and_offset(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    for name in ("First", "Second", "Third"):
        await _booking(async_client, studio, name=name, email=_email(name.lower()))

    first = await _list(async_client, studio, limit=2)
    assert first["total"] == 3
    assert first["limit"] == 2
    assert _names(first) == ["First", "Second"]
    rest = await _list(async_client, studio, limit=2, offset=2)
    assert rest["total"] == 3
    assert rest["offset"] == 2
    assert _names(rest) == ["Third"]
    beyond = await _list(async_client, studio, limit=2, offset=4)
    assert beyond["total"] == 3
    assert beyond["customers"] == []

    for params in ({"limit": 0}, {"limit": 201}, {"offset": -1}, {"q": "x" * 101}):
        response = await async_client.get(URL, headers=studio.headers, params=params)
        assert response.status_code == 422, params


async def test_another_organisation_never_sees_these_customers(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    other = await _studio(db_async, async_client)
    shared = _email("shared")
    await _booking(async_client, studio, name="Ada Here", email=shared)
    await _booking(async_client, studio, name="Ada Here", email=shared)
    await _booking(async_client, other, name="Ada There", email=shared)
    await _booking(async_client, other, name="Only There", email=_email("only"))

    mine = await _list(async_client, studio)
    assert _names(mine) == ["Ada Here"]
    assert mine["customers"][0]["bookings_count"] == 2
    theirs = await _list(async_client, other)
    assert sorted(_names(theirs)) == ["Ada There", "Only There"]
    assert (await _list(async_client, studio, q="Only There"))["total"] == 0

    # A member of one business naming the other in the header is refused (404:
    # the API does not say whether the organisation exists).
    crossed = {**studio.headers, "X-Barrels-Organisation": other.org_id}
    response = await async_client.get(URL, headers=crossed)
    assert response.status_code == 404, response.text
    assert "customers" not in response.json()


async def test_non_member_and_anonymous_are_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    await _booking(async_client, studio, name="Ada Lovelace", email=_email("ada"))
    stranger = await make_user(db_async)

    denied = await async_client.get(URL, headers=headers_for(stranger, studio.org_id))
    assert denied.status_code == 404, denied.text
    assert "customers" not in denied.json()
    assert (await async_client.get(URL)).status_code == 401


async def test_api_key_with_the_read_scope_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    await _booking(async_client, studio, name="Ada Lovelace", email=_email("ada"))
    reader = await _key(async_client, studio, ["bookings.read", "bookings.write"])

    # The key is good: it reads the organisation's settings.
    settings = await async_client.get(f"{API}/org/settings", headers=reader)
    assert settings.status_code == 200, settings.text
    response = await async_client.get(URL, headers=reader)
    assert response.status_code == 401, response.text
    assert "customers" not in response.json()
    assert "Ada" not in response.text


async def test_erased_contact_is_left_out(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    gone = await _booking(async_client, studio, name="Gone", email=_email("gone"))
    await _booking(async_client, studio, name="Here", email=_email("here"))
    booking = await db_async.get(Booking, uuid.UUID(gone))
    assert booking is not None
    contact_id = await db_async.scalar(
        select(Customer.contact_id).where(Customer.id == booking.customer_id)
    )
    await db_async.execute(
        update(Contact)
        .where(Contact.id == contact_id)
        .values(erased_at=utc_now(), name=None, email=None, phone=None)
    )
    await db_async.commit()

    body = await _list(async_client, studio)
    assert body["total"] == 1
    assert _names(body) == ["Here"]
