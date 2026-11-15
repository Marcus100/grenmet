"""Helpers for the Printix tests: events, tickets, pairings and scanner calls."""

import uuid
from datetime import date, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from src.config import settings
from src.printix import service
from src.printix.models import PrintixEvent, PrintixPairing, PrintixTicket
from src.utils.datetime import utc_now

ADMIN = f"{settings.API_V1_STR}/printix/admin"
SCANNER = f"{settings.API_V1_STR}/printix/public"


def in_hours(hours: float) -> datetime:
    return utc_now() + timedelta(hours=hours)


async def make_event(
    db: AsyncSession,
    *,
    name: str = "Boxing Day Gala",
    closes_at: datetime | None = None,
    status: str = "open",
) -> PrintixEvent:
    """An event with a future close unless ``closes_at`` says otherwise."""
    event = PrintixEvent(
        id=uuid.uuid4(),
        name=name,
        event_date=date(2026, 12, 26),
        closes_at=closes_at or in_hours(48),
        status=status,
        created_at=utc_now(),
    )
    db.add(event)
    await db.commit()
    return event


async def make_ticket(
    db: AsyncSession,
    event: PrintixEvent,
    number: str,
    barcode: str | None = None,
    *,
    status: str = "valid",
) -> PrintixTicket:
    ticket = PrintixTicket(
        id=uuid.uuid4(),
        event_id=event.id,
        printed_number=number,
        barcode_value=barcode or number,
        status=status,
        created_at=utc_now(),
    )
    db.add(ticket)
    await db.commit()
    return ticket


async def make_pairing(
    db: AsyncSession,
    event: PrintixEvent,
    *,
    gate: str = "Gate 1",
    expires_at: datetime | None = None,
) -> tuple[PrintixPairing, str]:
    """A pairing and its one-time secret, created through the service."""
    return await service.create_pairing(
        db,
        event.id,
        gate=gate,
        expires_at=expires_at,
        actor_id=None,
    )


def bearer(secret: str | None) -> dict[str, str]:
    return {} if secret is None else {"Authorization": f"Bearer {secret}"}


async def scan(
    client: httpx.AsyncClient, secret: str | None, value: str
) -> httpx.Response:
    return await client.post(
        f"{SCANNER}/admissions", headers=bearer(secret), json={"value": value}
    )


def outcome_of(response: httpx.Response) -> str:
    body: dict[str, Any] = response.json()
    return str(body["outcome"])
