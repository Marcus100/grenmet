"""Shared steps for the deposit email-code flow in tests."""

import re

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.outbox import Outbox
from tests.bookings.test_public_bookings import API, Studio


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
    match = re.search(r"<strong>(\d{6})</strong>", rows[0].payload["html"])
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
