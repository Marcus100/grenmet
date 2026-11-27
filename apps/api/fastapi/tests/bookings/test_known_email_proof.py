"""A free booking from an address the business already has needs the emailed code (#1969).

A no-deposit booking used to skip the proof entirely, so anyone could book a real
slot in a stranger's name and that stranger was mailed a confirmation. Now the
proof is required when the deposit is due OR the booking email is already a
contact of that organisation. A new address still books in one pass.
"""

import uuid

import httpx
from sqlalchemy import func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.email_verification import ERROR_CODE
from src.bookings.models import Booking
from src.contacts import service as contacts_service
from src.contacts.models import Contact
from tests.bookings.email_code_helpers import get_proof, latest_code, slot_body
from tests.bookings.memory_code_store import MemoryCodeStore
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _body,
    _emails,
    _slots,
    _studio,
)
from tests.factories import make_user
from tests.organisations.support import headers_for

EMAIL = "returning@example.com"


async def _create(
    client: httpx.AsyncClient,
    studio: Studio,
    slot: str,
    proof: str | None,
    *,
    email: str = EMAIL,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    return await client.post(
        f"{API}/public/{studio.slug}/bookings",
        headers={"Idempotency-Key": uuid.uuid4().hex, **(headers or {})},
        json=_body(studio, slot, customer_email=email, email_proof=proof),
    )


async def _booking_count(db: AsyncSession, org_id: str) -> int:
    db.expire_all()
    return int(
        await db.scalar(
            select(func.count(Booking.id)).where(Booking.organisation_id == org_id)
        )
        or 0
    )


async def _contact_rows(db: AsyncSession, org_id: str) -> list[dict[str, object]]:
    """Every contact of the organisation, as plain column values, for a before/after diff."""
    db.expire_all()
    columns = [attr.key for attr in inspect(Contact).column_attrs]
    rows = await db.scalars(select(Contact).where(Contact.organisation_id == org_id))
    return sorted(
        ({key: getattr(row, key) for key in columns} for row in rows),
        key=lambda row: str(row["id"]),
    )


async def _known_studio(
    db: AsyncSession, client: httpx.AsyncClient, email: str = EMAIL
) -> tuple[Studio, list[str]]:
    """A free-service business where ``email`` has already booked once (so it is a contact)."""
    studio = await _studio(db, client)
    slots = await _slots(client, studio)
    first = await _create(client, studio, slots[0], None, email=email)
    assert first.status_code == 201, first.text
    return studio, slots


# --- a new address still books in one pass ----------------------------------------------


async def test_a_new_address_books_a_free_slot_in_one_pass(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    code_store: MemoryCodeStore,
) -> None:
    studio = await _studio(db_async, async_client)
    slot = (await _slots(async_client, studio))[0]
    created = await _create(async_client, studio, slot, None, email="new@example.com")
    assert created.status_code == 201, created.text
    assert code_store._data == {}


# --- a known address is refused without proof, and stores nothing ------------------------


async def test_a_known_address_is_refused_without_proof_and_stores_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slots = await _known_studio(db_async, async_client)
    bookings_before = await _booking_count(db_async, studio.org_id)
    contacts_before = await _contact_rows(db_async, studio.org_id)
    emails_before = len(await _emails(db_async, studio.org_id))
    assert len(contacts_before) == 1

    refused = await _create(async_client, studio, slots[-1], None)

    assert refused.status_code == 403
    assert refused.json()["detail"].startswith(f"{ERROR_CODE}:")
    # The refused attempt is not stored: no booking row, no new or changed contact,
    # and no confirmation mail queued for the address.
    assert await _booking_count(db_async, studio.org_id) == bookings_before
    assert await _contact_rows(db_async, studio.org_id) == contacts_before
    assert len(await _emails(db_async, studio.org_id)) == emails_before


async def test_a_known_address_with_a_valid_proof_books(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, slots = await _known_studio(db_async, async_client)
    proof = await get_proof(db_async, async_client, studio, slots[-1], EMAIL)
    created = await _create(async_client, studio, slots[-1], proof)
    assert created.status_code == 201, created.text
    assert created.json()["payment_required"] is False


async def test_a_known_address_asks_for_a_code_and_the_code_proves_it(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The flow asks the code endpoint for a free booking only when the 403 told it
    # to, so for a known address that endpoint must send a code and say so.
    studio, slots = await _known_studio(db_async, async_client)
    sent = await async_client.post(
        f"{API}/public/{studio.slug}/email-code",
        json=slot_body(studio, slots[-1], EMAIL),
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["required"] is True
    code = await latest_code(db_async, studio.org_id)
    done = await async_client.post(
        f"{API}/public/{studio.slug}/email-code/confirm",
        json={**slot_body(studio, slots[-1], EMAIL), "code": code},
    )
    assert done.status_code == 200, done.text
    created = await _create(async_client, studio, slots[-1], done.json()["proof"])
    assert created.status_code == 201, created.text


async def test_a_new_address_gets_no_code_for_a_free_booking(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    code_store: MemoryCodeStore,
) -> None:
    studio = await _studio(db_async, async_client)
    slot = (await _slots(async_client, studio))[0]
    sent = await async_client.post(
        f"{API}/public/{studio.slug}/email-code",
        json=slot_body(studio, slot, "stranger@example.com"),
    )
    assert sent.json() == {"required": False, "expires_in_seconds": 0}
    assert code_store._data == {}


# --- a verified signed-in payer is still exempt -----------------------------------------


async def test_a_verified_payer_booking_their_own_free_slot_needs_no_proof(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    user = await make_user(db_async, verified=True)
    studio, slots = await _known_studio(db_async, async_client, email=user.email)
    created = await _create(
        async_client,
        studio,
        slots[-1],
        None,
        email=user.email,
        headers=headers_for(user),
    )
    assert created.status_code == 201, created.text


# --- the check is per business ----------------------------------------------------------


async def test_an_address_known_to_one_business_is_new_to_another(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # EMAIL is a contact of business A; business B has never seen it.
    await _known_studio(db_async, async_client)
    studio_b = await _studio(db_async, async_client)
    slot_b = (await _slots(async_client, studio_b))[0]

    created = await _create(async_client, studio_b, slot_b, None)

    assert created.status_code == 201, created.text
    assert await contacts_service.find_by_email(db_async, studio_b.org_id, EMAIL)
