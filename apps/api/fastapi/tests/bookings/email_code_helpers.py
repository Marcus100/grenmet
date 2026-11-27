"""Shared steps for the deposit email-code flow in tests."""

import re
import uuid

import httpx
from sqlalchemy import func, inspect, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import Booking
from src.contacts import service as contacts_service
from src.contacts.models import Contact
from src.outbox import Outbox
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _body,
    _slots,
    _studio,
)
from tests.email_payload import payload_html

#: The known address the #1969 and #1982 tests book first.
KNOWN_EMAIL = "returning@example.com"


async def latest_code(db: AsyncSession, org_id: str) -> str:
    """The most recently queued code for the organisation (from the outbox html)."""
    db.expire_all()
    rows = list(
        await db.scalars(
            select(Outbox)
            .where(
                Outbox.organisation_id == org_id,
                Outbox.dedupe_key.like("booking-email-code:%"),
            )
            .order_by(Outbox.created_at.desc())
        )
    )
    assert rows, "no code email was queued"
    match = re.search(r">(\d{6})</td>", payload_html(rows[0].payload))
    assert match
    return match.group(1)


def slot_body(studio: Studio, starts_at: str, email: str) -> dict[str, object]:
    return {
        "service_id": studio.service_id,
        "starts_at": starts_at,
        "customer_email": email,
    }


async def get_proof(
    db: AsyncSession,
    client: httpx.AsyncClient,
    studio: Studio,
    starts_at: str,
    email: str,
    headers: dict[str, str] | None = None,
) -> str:
    sent = await client.post(
        f"{API}/public/{studio.slug}/email-code",
        json=slot_body(studio, starts_at, email),
        headers=headers,
    )
    assert sent.status_code == 200, sent.text
    assert sent.json()["required"] is True
    code = await latest_code(db, studio.org_id)
    done = await client.post(
        f"{API}/public/{studio.slug}/email-code/confirm",
        json={**slot_body(studio, starts_at, email), "code": code},
    )
    assert done.status_code == 200, done.text
    return done.json()["proof"]


async def book_known(
    db: AsyncSession,
    client: httpx.AsyncClient,
    studio: Studio,
    starts_at: str,
    **overrides: object,
) -> httpx.Response:
    """``_book``, but a free booking from an address the business already has (#1969)
    is refused for want of a proof: then the emailed code is fetched and the same
    booking is sent again with it. Any other answer is returned as it is."""
    # Imported here: test_public_bookings imports nothing from this module.
    from tests.bookings.test_public_bookings import _body, _book

    response = await _book(client, studio, starts_at, **overrides)
    if (
        response.status_code != 403
        or "email_verification_required" not in response.text
    ):
        return response
    email = str(_body(studio, starts_at, **overrides)["customer_email"])
    # Only a known address may be refused for want of a proof. A new address must
    # book in one pass, so a refusal for one fails here instead of being fixed up.
    known = await contacts_service.find_by_email(db, studio.org_id, email)
    assert known is not None, "a new address was refused for want of an emailed code"
    proof = await get_proof(db, client, studio, starts_at, email)
    return await _book(client, studio, starts_at, email_proof=proof, **overrides)


# --- known-address helpers (#1969, #1982) --------------------------------------------


async def create_booking_request(
    client: httpx.AsyncClient,
    studio: Studio,
    slot: str,
    proof: str | None,
    *,
    email: str = KNOWN_EMAIL,
    headers: dict[str, str] | None = None,
) -> httpx.Response:
    return await client.post(
        f"{API}/public/{studio.slug}/bookings",
        headers={"Idempotency-Key": uuid.uuid4().hex, **(headers or {})},
        json=_body(studio, slot, customer_email=email, email_proof=proof),
    )


async def booking_count(db: AsyncSession, org_id: str) -> int:
    db.expire_all()
    return int(
        await db.scalar(
            select(func.count(Booking.id)).where(Booking.organisation_id == org_id)
        )
        or 0
    )


async def contact_rows(db: AsyncSession, org_id: str) -> list[dict[str, object]]:
    """Every contact of the organisation, as plain column values, for a before/after diff."""
    db.expire_all()
    columns = [attr.key for attr in inspect(Contact).column_attrs]
    rows = await db.scalars(select(Contact).where(Contact.organisation_id == org_id))
    return sorted(
        ({key: getattr(row, key) for key in columns} for row in rows),
        key=lambda row: str(row["id"]),
    )


async def known_studio(
    db: AsyncSession, client: httpx.AsyncClient, email: str = KNOWN_EMAIL
) -> tuple[Studio, list[str]]:
    """A free-service business where ``email`` has already booked once (so it is a contact)."""
    studio = await _studio(db, client)
    slots = await _slots(client, studio)
    first = await create_booking_request(client, studio, slots[0], None, email=email)
    assert first.status_code == 201, first.text
    return studio, slots
