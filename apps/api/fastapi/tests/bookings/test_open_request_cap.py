"""Booking hygiene (#1808): a customer may hold only ``max_open_per_customer`` future
bookings (pending, pending payment or confirmed) with one business. The public create
refuses the next one with 409. Staff and walk-in bookings are never refused."""

import uuid
from datetime import timedelta

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import public
from src.bookings.models import Booking
from src.contacts.models import Contact, ContactConsent
from src.utils.email_hash import hash_email
from tests.bookings.booking_day import MONDAY, utc_iso
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _booking_for,
    _slots,
    _studio,
)

EMAIL = "repeat-{}@example.com"


#: One text whatever the count (security review): it says what to do next without
#: disclosing how many bookings the address holds, nor what the cap is.
REFUSAL = (
    "This email address already has as many upcoming bookings with this business "
    "as we can hold online. To book another time, change or cancel one from the "
    "link in your booking email, or contact the business."
)


async def _book_again(
    client: httpx.AsyncClient, studio: Studio, email: str, slot: int = 0
) -> httpx.Response:
    """Book the first free slot of the day for ``email``."""
    slots = await _slots(client, studio)
    return await _book(client, studio, slots[slot], customer_email=email)


async def _fill(
    client: httpx.AsyncClient, studio: Studio, email: str, count: int
) -> list[dict]:
    receipts = []
    for _ in range(count):
        response = await _book_again(client, studio, email)
        assert response.status_code == 201, response.text
        receipts.append(response.json())
    return receipts


async def test_the_fourth_open_booking_is_refused_by_default(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    await _fill(async_client, studio, email, 3)

    refused = await _book_again(async_client, studio, email)
    assert refused.status_code == 409, refused.text
    assert refused.json()["detail"] == REFUSAL


async def test_a_cancelled_booking_frees_room_under_the_cap(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    receipts = await _fill(async_client, studio, email, 3)
    assert (await _book_again(async_client, studio, email)).status_code == 409

    cancel = await async_client.post(
        f"{API}/public/bookings/{receipts[0]['manage_token']}/cancel"
    )
    assert cancel.status_code == 200, cancel.text
    again = await _book_again(async_client, studio, email)
    assert again.status_code == 201, again.text


async def test_a_pending_request_counts_towards_the_cap(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async,
        async_client,
        providers=4,
        requires_confirmation=True,
        max_open_per_customer=2,
    )
    email = EMAIL.format(uuid.uuid4().hex[:8])
    await _fill(async_client, studio, email, 2)
    refused = await _book_again(async_client, studio, email)
    assert refused.status_code == 409
    assert refused.json()["detail"] == REFUSAL


async def test_the_refusal_is_the_same_text_whatever_the_count(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """A cap of 1 refuses with the same words as a cap of 3, so the refusal says
    neither how many bookings the address holds nor what the business's cap is."""
    studio = await _studio(db_async, async_client, providers=2, max_open_per_customer=1)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    await _fill(async_client, studio, email, 1)
    refused = await _book_again(async_client, studio, email)
    assert refused.status_code == 409
    detail = refused.json()["detail"]
    assert detail == REFUSAL
    # No number at all: not the count, not the cap.
    assert not any(character.isdigit() for character in detail)


async def test_another_customer_is_not_affected(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    await _fill(async_client, studio, EMAIL.format("full-a"), 3)
    other = await _book_again(async_client, studio, EMAIL.format("open-b"))
    assert other.status_code == 201, other.text


async def test_past_bookings_do_not_count(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    receipts = await _fill(async_client, studio, email, 3)
    # The three have started: they are no longer upcoming.
    for receipt in receipts:
        booking = await _booking_for(db_async, receipt["booking"]["id"])
        past = booking.starts_at - timedelta(days=30)
        booking.starts_at = past
        booking.ends_at = past + timedelta(hours=2)
        booking.blocked_from = past
        booking.blocked_until = booking.ends_at
    await db_async.commit()

    again = await _book_again(async_client, studio, email)
    assert again.status_code == 201, again.text


async def test_staff_bookings_are_never_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from tests.bookings.test_studio_create import _create

    studio = await _studio(db_async, async_client, providers=1)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    for week in range(4):
        response = await _create(
            async_client,
            studio,
            utc_iso(9, 30, day=MONDAY + timedelta(days=7 * week)),
            customer_email=email,
        )
        assert response.status_code == 201, response.text

    # Staff bookings are upcoming bookings of this customer, so they do count
    # towards the next online booking, but they never refuse a staff entry.
    refused = await _book_again(async_client, studio, email)
    assert refused.status_code == 409
    assert refused.json()["detail"] == REFUSAL


async def test_a_walk_in_without_an_email_is_not_capped(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from tests.bookings.test_studio_create import _create

    studio = await _studio(db_async, async_client, providers=1, max_open_per_customer=1)
    for week in range(3):
        response = await _create(
            async_client,
            studio,
            utc_iso(9, 30, day=MONDAY + timedelta(days=7 * week)),
        )
        assert response.status_code == 201, response.text
    # Walk-ins carry no email, so they belong to no customer's count.
    online = await _book_again(async_client, studio, EMAIL.format("fresh"))
    assert online.status_code == 201, online.text


def test_refusal_wording_says_what_to_do_without_a_number() -> None:
    assert public.OPEN_CAP_MESSAGE == REFUSAL
    # The customer is told how to free a slot up themselves.
    assert "link in your booking email" in REFUSAL
    # The page shows the business's contact links under a message that says so.
    assert "contact the business" in REFUSAL
    assert not any(character.isdigit() for character in REFUSAL)


async def test_the_same_address_in_another_case_is_the_same_customer(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    await _fill(async_client, studio, "A@x.com", 3)
    # Email is normalised for the contact, so the lower-case address is the same
    # customer and already at the cap.
    refused = await _book_again(async_client, studio, "a@x.com")
    assert refused.status_code == 409, refused.text
    assert refused.json()["detail"] == REFUSAL


async def test_a_refused_request_stores_no_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The cap is checked after the contact is upserted; the refusal must roll
    # back the whole create so nothing (no booking, no extra mail) is stored.
    studio = await _studio(db_async, async_client, providers=4)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    await _fill(async_client, studio, email, 3)
    before = await db_async.scalar(
        select(func.count(Booking.id)).where(Booking.organisation_id == studio.org_id)
    )
    assert (await _book_again(async_client, studio, email)).status_code == 409
    db_async.expire_all()
    after = await db_async.scalar(
        select(func.count(Booking.id)).where(Booking.organisation_id == studio.org_id)
    )
    assert before == after == 3


async def _contact_for(db: AsyncSession, org_id: str, email: str) -> Contact:
    db.expire_all()
    contact = await db.scalar(
        select(Contact).where(
            Contact.organisation_id == org_id,
            Contact.email_hash == hash_email(email),
        )
    )
    assert contact is not None
    return contact


async def _consents_for(db: AsyncSession, contact_id: str) -> list[tuple[str, bool]]:
    db.expire_all()
    rows = await db.scalars(
        select(ContactConsent)
        .where(ContactConsent.contact_id == contact_id)
        .order_by(ContactConsent.id)
    )
    return [(row.purpose, row.granted) for row in rows]


async def test_a_refused_request_leaves_the_contact_exactly_as_it_was(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """The cap is checked after ``_upsert_customer`` has already written the name,
    phone and marketing decision the caller supplied, and a public create needs no
    proof of the address. If the 409 did not roll that write back, anyone could fill
    in a stranger's blank contact details and flip their marketing consent by
    sending an over-cap booking for their email. The whole create must roll back.

    The contact's name and phone are blanked first, because ``upsert_contact`` keeps
    details that are already set and only fills blanks: the blank is the path where
    a missing rollback would actually overwrite something. The consent row is the
    other half, since ``_apply_consents`` inserts one whenever the decision changes.
    """
    studio = await _studio(db_async, async_client, providers=4)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    await _fill(async_client, studio, email, 3)

    contact = await _contact_for(db_async, studio.org_id, email)
    contact.name = None
    contact.phone = None
    await db_async.commit()
    before = await _contact_for(db_async, studio.org_id, email)
    was = (before.name, before.phone, before.email, before.user_id, before.updated_at)
    consents_before = await _consents_for(db_async, before.id)
    # The bookings above recorded "no marketing", so True below is a real change
    # and would insert a row (this is what gives the assertion its teeth).
    assert consents_before == [("marketing", False)]

    refused = await _book(
        async_client,
        studio,
        (await _slots(async_client, studio))[0],
        customer_email=email,
        customer_name="Attacker Name",
        customer_phone="+1 473 555 9999",
        marketing_consent=True,
    )
    assert refused.status_code == 409, refused.text
    assert refused.json()["detail"] == REFUSAL

    after = await _contact_for(db_async, studio.org_id, email)
    assert (
        after.name,
        after.phone,
        after.email,
        after.user_id,
        after.updated_at,
    ) == was
    assert after.name is None and after.phone is None
    assert await _consents_for(db_async, after.id) == consents_before


async def test_an_accepted_request_does_record_the_contact_write(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """The control for the test above: the same write, on a request that is not
    refused, does fill a blank name and phone and does insert the changed consent
    row. So their absence after a 409 is the rollback, not an inert code path."""
    studio = await _studio(db_async, async_client, providers=4)
    email = EMAIL.format(uuid.uuid4().hex[:8])
    first = await _book_again(async_client, studio, email)
    assert first.status_code == 201, first.text

    contact = await _contact_for(db_async, studio.org_id, email)
    contact.name = None
    contact.phone = None
    await db_async.commit()
    assert await _consents_for(db_async, contact.id) == [("marketing", False)]

    accepted = await _book(
        async_client,
        studio,
        (await _slots(async_client, studio))[0],
        customer_email=email,
        customer_name="Second Booking",
        customer_phone="+1 473 555 0188",
        marketing_consent=True,
    )
    assert accepted.status_code == 201, accepted.text

    after = await _contact_for(db_async, studio.org_id, email)
    assert after.name == "Second Booking"
    assert after.phone == "+1 473 555 0188"
    assert await _consents_for(db_async, after.id) == [
        ("marketing", False),
        ("marketing", True),
    ]
