"""Erasing a contact clears the free-text notes the person typed on their bookings
(#1963 part 2). The booking rows survive; another customer's notes are untouched.
Assertions read the database.
"""

import uuid

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Booking
from src.contacts import service as contacts_service
from src.contacts.models import Contact
from src.utils.email_hash import hash_email
from tests.bookings.email_code_helpers import book_known
from tests.bookings.test_public_bookings import _slots, _studio


async def _contact_for(db: AsyncSession, org_id: str, email: str) -> Contact:
    contact = await db.scalar(
        select(Contact).where(
            Contact.organisation_id == org_id,
            Contact.email_hash == hash_email(email),
        )
    )
    assert contact is not None
    return contact


async def test_erasure_clears_booking_notes_and_keeps_the_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    gone = f"gone-{uuid.uuid4().hex[:8]}@example.com"
    kept = f"kept-{uuid.uuid4().hex[:8]}@example.com"
    first = await book_known(
        db_async,
        async_client,
        studio,
        slots[0],
        customer_email=gone,
        customer_name="TEST verify",
    )
    second = await book_known(
        db_async,
        async_client,
        studio,
        slots[-1],
        customer_email=gone,
        customer_name="TEST direct",
    )
    # Another business with its own calendar: its customer's notes must survive.
    other_studio = await _studio(db_async, async_client)
    other_slots = await _slots(async_client, other_studio)
    other = await book_known(
        db_async,
        async_client,
        other_studio,
        other_slots[0],
        customer_email=kept,
        customer_name="TEST other",
    )
    assert first.status_code == second.status_code == other.status_code == 201
    gone_ids = [uuid.UUID(b.json()["booking"]["id"]) for b in (first, second)]
    other_id = uuid.UUID(other.json()["booking"]["id"])

    texts = (
        (gone_ids[0], "allergic to latex, 473-555-0123"),
        (gone_ids[1], "call first"),
        (other_id, "window seat"),
    )
    for booking_id, text in texts:
        row = await db_async.get(Booking, booking_id)
        assert row is not None
        row.notes = text
    await db_async.commit()

    contact = await _contact_for(db_async, studio.org_id, gone)
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()
    db_async.expire_all()

    for booking_id in gone_ids:
        row = await db_async.get(Booking, booking_id)
        assert row is not None, "the booking row must survive erasure"
        assert row.notes is None

    survivor = await db_async.get(Booking, other_id)
    assert survivor is not None
    assert survivor.notes == "window seat"


async def test_erasing_twice_leaves_notes_empty_and_does_not_error(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    email = f"twice-{uuid.uuid4().hex[:8]}@example.com"
    booked = await book_known(
        db_async,
        async_client,
        studio,
        slots[0],
        customer_email=email,
        customer_name="TEST twice",
    )
    assert booked.status_code == 201, booked.text
    booking_id = uuid.UUID(booked.json()["booking"]["id"])
    row = await db_async.get(Booking, booking_id)
    assert row is not None
    row.notes = "please ring twice"
    await db_async.commit()

    contact = await _contact_for(db_async, studio.org_id, email)
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()
    db_async.expire_all()

    row = await db_async.get(Booking, booking_id)
    assert row is not None
    assert row.notes is None
