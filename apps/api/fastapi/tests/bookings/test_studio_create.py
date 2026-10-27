"""Bookings: the business enters a booking itself (phone, walk-in, re-entry)."""

import uuid
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Customer
from src.contacts import service as contacts_service
from src.contacts.models import ConsentPurpose, Contact
from src.organisations import service as org_service
from src.organisations.models import MembershipRole
from tests.bookings.test_public_bookings import (
    API,
    DAY,
    Studio,
    _book,
    _booking_for,
    _emails,
    _slots,
    _studio,
)
from tests.bookings.test_studio import _events, _key
from tests.factories import make_user
from tests.organisations.support import headers_for

URL = f"{API}/org/bookings"


def _body(studio: Studio, starts_at: str, **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "service_id": studio.service_id,
        "provider_id": studio.provider_ids[0],
        "starts_at": starts_at,
        "customer_name": "Walk In",
    }
    body.update(overrides)
    return body


async def _create(
    client: httpx.AsyncClient,
    studio: Studio,
    starts_at: str,
    *,
    key: str | None = None,
    headers: dict[str, str] | None = None,
    **overrides: object,
) -> httpx.Response:
    return await client.post(
        URL,
        headers={
            **(headers or studio.headers),
            "Idempotency-Key": key or uuid.uuid4().hex,
        },
        json=_body(studio, starts_at, **overrides),
    )


async def test_studio_creates_a_confirmed_booking_without_email(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slot = (await _slots(async_client, studio))[0]
    response = await _create(
        async_client, studio, slot, customer_phone="+1 473 555 0111"
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "confirmed"
    assert body["source"] == "studio"
    assert body["deposit_minor"] == 0
    assert body["customer"]["name"] == "Walk In"
    assert body["customer"]["email"] is None
    assert body["customer"]["phone"] == "+1 473 555 0111"
    assert [e["note"] for e in body["events"]] == ["Entered by the business"]
    events = await _events(db_async, body["id"])
    assert events[0].actor_user_id is not None
    assert await _emails(db_async, studio.org_id) == []


async def test_confirmation_is_emailed_only_when_asked(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    quiet = await _create(
        async_client, studio, slots[0], customer_email="quiet@example.com"
    )
    assert quiet.status_code == 201, quiet.text
    assert await _emails(db_async, studio.org_id) == []

    loud = await _create(
        async_client,
        studio,
        slots[-1],
        customer_email="loud@example.com",
        send_confirmation=True,
    )
    assert loud.status_code == 201, loud.text
    emails = await _emails(db_async, studio.org_id)
    assert [e.dedupe_key for e in emails] == [
        f"booking-confirmation:{loud.json()['id']}"
    ]

    missing = await _create(async_client, studio, slots[1], send_confirmation=True)
    assert missing.status_code == 422


async def test_same_email_reuses_the_customer(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    first = await _create(
        async_client, studio, slots[0], customer_email="a@example.com"
    )
    second = await _create(
        async_client, studio, slots[-1], customer_email="A@Example.com"
    )
    assert first.json()["customer"]["id"] == second.json()["customer"]["id"]


async def test_overlap_is_rejected_with_409(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slot = (await _slots(async_client, studio))[0]
    assert (await _create(async_client, studio, slot)).status_code == 201
    clash = await _create(async_client, studio, slot)
    assert clash.status_code == 409
    # The public flow no longer offers the taken slot either.
    assert slot not in await _slots(async_client, studio)


async def test_an_online_booking_blocks_a_studio_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slot = (await _slots(async_client, studio))[0]
    assert (await _book(async_client, studio, slot)).status_code == 201
    assert (await _create(async_client, studio, slot)).status_code == 409


async def test_staff_may_book_outside_hours_lead_time_and_horizon(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, horizon_days=1)
    # A Sunday evening far past the horizon, when the diary is closed.
    assert "2027-01-03T22:00:00Z" not in await _slots(async_client, studio)
    response = await _create(async_client, studio, "2027-01-03T22:00:00Z")
    assert response.status_code == 201, response.text
    # A walk-in starting an hour from now is inside any lead time.
    soon = (datetime.now(UTC) + timedelta(hours=1)).replace(microsecond=0)
    walk_in = await _create(
        async_client, studio, soon.isoformat().replace("+00:00", "Z")
    )
    assert walk_in.status_code == 201, walk_in.text


async def test_replay_returns_the_first_answer_and_stores_one_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    first = await _create(async_client, studio, slots[0], key="walk-in-1")
    again = await _create(async_client, studio, slots[0], key="walk-in-1")
    assert first.status_code == again.status_code == 201
    assert again.headers["Idempotency-Replayed"] == "true"
    assert first.json()["id"] == again.json()["id"]
    reused = await _create(async_client, studio, slots[-1], key="walk-in-1")
    assert reused.status_code == 409


async def test_the_key_header_is_required(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slot = (await _slots(async_client, studio))[0]
    response = await async_client.post(
        URL, headers=studio.headers, json=_body(studio, slot)
    )
    assert response.status_code == 400


async def test_provider_must_offer_the_service_and_belong_to_the_org(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    other = await _studio(db_async, async_client)
    slot = (await _slots(async_client, studio))[0]

    foreign_provider = await _create(
        async_client, studio, slot, provider_id=other.provider_ids[0]
    )
    assert foreign_provider.status_code == 404
    foreign_service = await _create(
        async_client, studio, slot, service_id=other.service_id
    )
    assert foreign_service.status_code == 404

    bare = await async_client.post(
        f"{API}/org/providers",
        headers=studio.headers,
        json={"name": "Trainee", "service_ids": []},
    )
    unqualified = await _create(
        async_client, studio, slot, provider_id=bare.json()["id"]
    )
    assert unqualified.status_code == 422


async def test_a_plain_member_cannot_create_and_a_key_needs_write(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    member = await make_user(db_async)
    await org_service.add_member(
        db_async,
        organisation_id=studio.org_id,
        user_id=member.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()
    denied = await _create(
        async_client, studio, slots[0], headers=headers_for(member, studio.org_id)
    )
    assert denied.status_code == 403

    reader = await _key(async_client, studio, ["bookings.read"])
    assert (
        await _create(async_client, studio, slots[0], headers=reader)
    ).status_code == 403
    anonymous = await async_client.post(
        URL, headers={"Idempotency-Key": uuid.uuid4().hex}, json=_body(studio, slots[0])
    )
    assert anonymous.status_code == 401

    writer = await _key(async_client, studio, ["bookings.write"])
    allowed = await _create(async_client, studio, slots[0], headers=writer)
    assert allowed.status_code == 201, allowed.text
    events = await _events(db_async, allowed.json()["id"])
    assert events[0].actor_user_id is None
    booking = await _booking_for(db_async, allowed.json()["id"])
    assert booking.source == "studio"
    assert DAY in booking.starts_at.isoformat()


async def _customer(db: AsyncSession, body: dict[str, Any]) -> Customer:
    db.expire_all()
    customer = await db.get(Customer, uuid.UUID(body["customer"]["id"]))
    assert customer is not None
    return customer


async def test_an_email_links_the_contact_without_recording_consent(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, apps=("bookings", "contacts"))
    slots = await _slots(async_client, studio)
    emailed = await _create(
        async_client,
        studio,
        slots[0],
        customer_email="regular@example.com",
        customer_phone="+1 473 555 0122",
    )
    assert emailed.status_code == 201, emailed.text
    customer = await _customer(db_async, emailed.json())
    assert customer.contact_id is not None
    emailed_contact_id = customer.contact_id
    contact = await db_async.get(Contact, customer.contact_id)
    assert contact is not None
    assert contact.source == "bookings"
    assert contact.phone == "+1 473 555 0122"
    consents = await contacts_service.current_consents(db_async, contact.id)
    assert ConsentPurpose.MARKETING not in consents

    walk_in = await _create(async_client, studio, slots[-1])
    walk_in_customer = await _customer(db_async, walk_in.json())
    walk_in_contact = await db_async.get(Contact, walk_in_customer.contact_id)
    assert walk_in_contact is not None
    # No address, so nothing to match on: its own contact, never merged by name.
    assert walk_in_contact.email is None and walk_in_contact.email_hash is None
    assert walk_in_contact.id != emailed_contact_id


async def test_the_contact_is_kept_in_a_bookings_only_organisation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slot = (await _slots(async_client, studio))[0]
    created = await _create(
        async_client, studio, slot, customer_email="plain@example.com"
    )
    customer = await _customer(db_async, created.json())
    contacts = (
        await db_async.scalars(
            select(Contact).where(Contact.organisation_id == studio.org_id)
        )
    ).all()
    # Every customer has a contact (ADR-0028); the product only unlocks the book.
    assert [c.id for c in contacts] == [customer.contact_id]
