"""Erasing a contact clears ``booking.cancel_reason`` on that person's bookings.

The reason is free text: staff's reason for a decline or cancellation (shown to the
customer and kept on the booking) or the customer's own reason when they cancel.
The booking row survives with its status and cancellation time. A different
customer of the same business keeps theirs. Assertions read the database.
"""

import uuid

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Booking
from src.contacts import service as contacts_service
from tests.bookings.test_erasure_clears_event_notes import _book_next, _contact_for
from tests.bookings.test_public_bookings import API, _studio


async def test_erasure_clears_cancel_reasons_and_keeps_the_cancelled_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    gone = f"gone-cr-{uuid.uuid4().hex[:8]}@example.com"
    kept = f"kept-cr-{uuid.uuid4().hex[:8]}@example.com"
    gone_booking = await _book_next(db_async, async_client, studio, gone, "TEST gone")
    kept_booking = await _book_next(db_async, async_client, studio, kept, "TEST kept")

    staff_cancel = await async_client.post(
        f"{API}/org/bookings/{gone_booking}/cancel",
        headers=studio.headers,
        json={"reason": "Customer rang, 473-555-0123, allergic to latex"},
    )
    assert staff_cancel.status_code == 200, staff_cancel.text
    kept_cancel = await async_client.post(
        f"{API}/org/bookings/{kept_booking}/cancel",
        headers=studio.headers,
        json={"reason": "Van broke down"},
    )
    assert kept_cancel.status_code == 200, kept_cancel.text

    # A customer's own reason, as the public cancel route stores it.
    own = await db_async.get(Booking, gone_booking)
    assert own is not None
    own.cancel_reason = "Moving abroad, my doctor says no flights"
    await db_async.commit()
    gone_row = await db_async.get(Booking, gone_booking)
    assert gone_row is not None
    cancelled_at = gone_row.cancelled_at
    assert gone_row.cancel_reason is not None

    contact = await _contact_for(db_async, studio.org_id, gone)
    await contacts_service.erase_contact(db_async, contact)
    await db_async.commit()
    db_async.expire_all()

    erased = await db_async.get(Booking, gone_booking)
    assert erased is not None, "the booking row must survive erasure"
    assert erased.status == "cancelled"
    assert erased.cancelled_at == cancelled_at
    assert erased.cancel_reason is None

    survivor = await db_async.get(Booking, kept_booking)
    assert survivor is not None
    assert survivor.cancel_reason == "Van broke down"
