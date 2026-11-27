"""Shared steps for the deposit email-code flow in tests."""

import re

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.outbox import Outbox
from tests.bookings.test_public_bookings import API, Studio
from tests.email_payload import payload_html


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
    proof = await get_proof(db, client, studio, starts_at, email)
    return await _book(client, studio, starts_at, email_proof=proof, **overrides)
