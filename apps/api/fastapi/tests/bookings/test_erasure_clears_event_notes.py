"""Erasing a contact clears the note text on that person's booking history rows.

The staff-written timeline (``booking_event.note``) can hold anything staff typed, so
erasure blanks it through the same ``contacts.references`` hook as the booking copies.
The history rows survive with their kinds, timestamps and reason codes. Another
customer of the same business keeps its notes: that is the failure this guards.
Assertions read the database.
"""

import uuid
from dataclasses import dataclass

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import BookingEvent
from src.contacts import service as contacts_service
from src.contacts.models import Contact
from src.utils.email_hash import hash_email
from tests.bookings.email_code_helpers import book_known
from tests.bookings.test_public_bookings import API, Studio, _slots, _studio
from tests.bookings.test_studio import _events


@dataclass(frozen=True)
class Snapshot:
    id: uuid.UUID
    from_status: str | None
    to_status: str
    created_at: object
    reason: str | None


async def _book_next(
    db: AsyncSession, client: httpx.AsyncClient, studio: Studio, email: str, name: str
) -> uuid.UUID:
    # Ask for free slots each time: the first slot is taken by the booking before.
    slots = await _slots(client, studio)
    response = await book_known(
        db, client, studio, slots[0], customer_email=email, customer_name=name
    )
    assert response.status_code == 201, response.text
    return uuid.UUID(response.json()["booking"]["id"])


async def _contact_for(db: AsyncSession, org_id: str, email: str) -> Contact:
    contact = await db.scalar(
        select(Contact).where(
            Contact.organisation_id == org_id,
            Contact.email_hash == hash_email(email),
        )
    )
    assert contact is not None
    return contact


async def _set_notes(db: AsyncSession, booking_id: uuid.UUID, note: str) -> None:
    for event in await _events(db, str(booking_id)):
        event.note = note
    await db.commit()


async def _snapshot(db: AsyncSession, booking_id: uuid.UUID) -> list[Snapshot]:
    return [
        Snapshot(
            id=e.id,
            from_status=e.from_status,
            to_status=e.to_status,
            created_at=e.created_at,
            reason=e.reason,
        )
        for e in await _events(db, str(booking_id))
    ]


async def test_erasure_clears_event_notes_and_keeps_the_timeline(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    gone = f"gone-ev-{uuid.uuid4().hex[:8]}@example.com"
    kept = f"kept-ev-{uuid.uuid4().hex[:8]}@example.com"
    gone_first = await _book_next(db_async, async_client, studio, gone, "TEST gone")
    gone_second = await _book_next(db_async, async_client, studio, gone, "TEST gone")
    # Another customer of the same business: same calendar, same kind of history.
    kept_booking = await _book_next(db_async, async_client, studio, kept, "TEST kept")

    # The history of the first booking: created, then cancelled with a reason code.
    cancelled = await async_client.post(
        f"{API}/org/bookings/{gone_first}/cancel",
        headers=studio.headers,
        json={"reason": "Customer asked to stop", "reason_code": "customer_request"},
    )
    assert cancelled.status_code == 200, cancelled.text

    await _set_notes(db_async, gone_first, "mentioned she reacts to the dye")
    await _set_notes(db_async, gone_second, "customer rang, 473-555-0123")
    await _set_notes(db_async, kept_booking, "window seat")
    before = {
        booking_id: await _snapshot(db_async, booking_id)
        for booking_id in (gone_first, gone_second, kept_booking)
    }
    assert [s.to_status for s in before[gone_first]] == ["confirmed", "cancelled"]

    contact = await _contact_for(db_async, studio.org_id, gone)
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()
    db_async.expire_all()

    for booking_id in (gone_first, gone_second):
        after = await _events(db_async, str(booking_id))
        assert [e.note for e in after] == [None] * len(after)
        # Kinds, timestamps, ids and reason codes are the business's record: kept.
        assert [
            Snapshot(e.id, e.from_status, e.to_status, e.created_at, e.reason)
            for e in after
        ] == before[booking_id]

    cancel_row = (await _events(db_async, str(gone_first)))[-1]
    assert cancel_row.reason == "customer_request"

    survivor = await _events(db_async, str(kept_booking))
    assert survivor, "the other customer's history must still exist"
    assert {e.note for e in survivor} == {"window seat"}


async def test_erasing_twice_leaves_event_notes_empty(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    email = f"twice-ev-{uuid.uuid4().hex[:8]}@example.com"
    booking_id = await _book_next(db_async, async_client, studio, email, "TEST twice")
    await _set_notes(db_async, booking_id, "please ring twice")
    before = await _snapshot(db_async, booking_id)

    contact = await _contact_for(db_async, studio.org_id, email)
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()
    db_async.expire_all()

    rows = await db_async.scalars(
        select(BookingEvent).where(BookingEvent.booking_id == booking_id)
    )
    assert all(row.note is None for row in rows.all())
    assert await _snapshot(db_async, booking_id) == [
        Snapshot(s.id, s.from_status, s.to_status, s.created_at, s.reason)
        for s in before
    ]
