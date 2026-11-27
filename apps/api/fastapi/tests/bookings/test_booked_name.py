"""Each booking shows the name typed on it (issue #1951, item 7).

Someone who books a second time with the same email, under a different name,
used to see the first booking's name: the name lived only on the contact, which
``upsert_contact`` deliberately never overwrites from a form. The name typed on a
booking is now stored on the booking (``booking.booked_name``), so the booking,
its mail, the agenda and the studio detail all show it, while the contact keeps
its own curated name for matching and the customer list.
"""

import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Booking
from src.contacts import service as contacts_service
from src.contacts.models import Contact
from src.utils.email_hash import hash_email
from tests.bookings.booking_day import DAY
from tests.bookings.email_code_helpers import book_known
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _emails,
    _slots,
    _studio,
)
from tests.email_payload import payload_text


async def _manage(client: httpx.AsyncClient, token: str) -> dict[str, object]:
    response = await client.get(f"{API}/public/bookings/{token}")
    assert response.status_code == 200, response.text
    return response.json()


async def _agenda_names(client: httpx.AsyncClient, studio: Studio) -> list[str]:
    response = await client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={"from_date": str(DAY), "to_date": str(DAY)},
    )
    assert response.status_code == 200, response.text
    return [
        item["customer_name"]
        for day in response.json()["days"]
        for item in day["bookings"]
    ]


async def test_a_second_booking_shows_the_name_typed_on_it(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    first = await book_known(
        db_async,
        async_client,
        studio,
        slots[0],
        customer_email=email,
        customer_name="TEST verify",
    )
    assert first.status_code == 201, first.text
    second = await book_known(
        db_async,
        async_client,
        studio,
        slots[-1],
        customer_email=email,
        customer_name="TEST direct",
    )
    assert second.status_code == 201, second.text

    # The receipt of the second booking, and its manage page later, say what was
    # typed on it; the first booking is untouched.
    assert second.json()["booking"]["customer_name"] == "TEST direct"
    assert first.json()["booking"]["customer_name"] == "TEST verify"
    assert (await _manage(async_client, second.json()["manage_token"]))[
        "customer_name"
    ] == "TEST direct"
    assert (await _manage(async_client, first.json()["manage_token"]))[
        "customer_name"
    ] == "TEST verify"

    # Both bookings are one contact, which keeps the name it was created with:
    # matching is by email hash, and a public form never rewrites curated details.
    contact = await db_async.scalar(
        select(Contact).where(
            Contact.organisation_id == studio.org_id,
            Contact.email_hash == hash_email(email),
        )
    )
    assert contact is not None
    assert contact.name == "TEST verify"


async def test_the_studio_sees_each_bookings_own_name(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    first = await book_known(
        db_async,
        async_client,
        studio,
        slots[0],
        customer_email=email,
        customer_name="TEST verify",
    )
    second = await book_known(
        db_async,
        async_client,
        studio,
        slots[-1],
        customer_email=email,
        customer_name="TEST direct",
    )
    assert first.status_code == second.status_code == 201

    assert await _agenda_names(async_client, studio) == ["TEST verify", "TEST direct"]
    detail = await async_client.get(
        f"{API}/org/bookings/{second.json()['booking']['id']}", headers=studio.headers
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["customer"]["name"] == "TEST direct"

    # The customer list stays contact-level: one row, the contact's own name.
    customers = await async_client.get(f"{API}/org/customers", headers=studio.headers)
    assert customers.status_code == 200, customers.text
    rows = customers.json()["customers"]
    assert [row["name"] for row in rows] == ["TEST verify"]
    assert rows[0]["bookings_count"] == 2


async def test_the_studio_mail_names_the_person_who_made_that_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """The customer greeting is a first name, which both bookings share here; the
    studio's own mail carries the whole name typed on the booking."""
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    first = await book_known(
        db_async,
        async_client,
        studio,
        slots[0],
        customer_email=email,
        customer_name="TEST verify",
    )
    second = await book_known(
        db_async,
        async_client,
        studio,
        slots[-1],
        customer_email=email,
        customer_name="TEST direct",
    )
    assert first.status_code == second.status_code == 201
    rows = {row.dedupe_key: row for row in await _emails(db_async, studio.org_id)}
    second_id = second.json()["booking"]["id"]
    first_id = first.json()["booking"]["id"]
    assert "TEST direct" in payload_text(
        rows[f"booking-studio-created:{second_id}"].payload
    )
    assert "TEST verify" in payload_text(
        rows[f"booking-studio-created:{first_id}"].payload
    )


async def test_a_booking_made_before_the_column_falls_back_to_the_contact(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """Existing rows have no ``booked_name``; they read exactly as before."""
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    booked = await _book(
        async_client,
        studio,
        slots[0],
        customer_email=email,
        customer_name="TEST verify",
    )
    assert booked.status_code == 201, booked.text
    db_async.expire_all()
    row = await db_async.get(Booking, uuid.UUID(booked.json()["booking"]["id"]))
    assert row is not None
    row.booked_name = None
    await db_async.commit()

    assert (await _manage(async_client, booked.json()["manage_token"]))[
        "customer_name"
    ] == "TEST verify"
    assert await _agenda_names(async_client, studio) == ["TEST verify"]


async def test_erasing_the_contact_clears_the_names_typed_on_its_bookings(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """Erasure has to take the copy with it. Every booking view prefers
    ``booked_name``, so leaving it would keep showing an erased customer's full
    name in the agenda, the booking detail, the calendar feed and the manage
    page (`src/contacts/AGENTS.md`: domains must respect ``erased_at``). The
    stored data really goes; nothing is hidden at read time."""
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    email = f"gone-{uuid.uuid4().hex[:8]}@example.com"
    first = await book_known(
        db_async,
        async_client,
        studio,
        slots[0],
        customer_email=email,
        customer_name="TEST verify",
    )
    second = await book_known(
        db_async,
        async_client,
        studio,
        slots[-1],
        customer_email=email,
        customer_name="TEST direct",
    )
    assert first.status_code == second.status_code == 201

    contact = await db_async.scalar(
        select(Contact).where(
            Contact.organisation_id == studio.org_id,
            Contact.email_hash == hash_email(email),
        )
    )
    assert contact is not None
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()

    db_async.expire_all()
    for booked in (first, second):
        row = await db_async.get(Booking, uuid.UUID(booked.json()["booking"]["id"]))
        assert row is not None
        assert row.booked_name is None

    detail = await async_client.get(
        f"{API}/org/bookings/{second.json()['booking']['id']}", headers=studio.headers
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["customer"]["name"] == ""
    assert await _agenda_names(async_client, studio) == ["", ""]


async def test_erasing_one_contact_leaves_another_persons_bookings_alone(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    gone = f"gone-{uuid.uuid4().hex[:8]}@example.com"
    kept_email = f"kept-{uuid.uuid4().hex[:8]}@example.com"
    erased = await _book(
        async_client, studio, slots[0], customer_email=gone, customer_name="TEST verify"
    )
    kept = await _book(
        async_client,
        studio,
        slots[-1],
        customer_email=kept_email,
        customer_name="Ada Lovelace",
    )
    assert erased.status_code == kept.status_code == 201

    contact = await db_async.scalar(
        select(Contact).where(
            Contact.organisation_id == studio.org_id,
            Contact.email_hash == hash_email(gone),
        )
    )
    assert contact is not None
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()

    assert await _agenda_names(async_client, studio) == ["", "Ada Lovelace"]
