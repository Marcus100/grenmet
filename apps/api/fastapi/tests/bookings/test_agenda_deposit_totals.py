"""Bookings: the agenda row carries the deposit's captured and refunded amounts, so a
cancelled paid booking can show whether money is held or refunded (issue #1939)."""

from datetime import datetime
from zoneinfo import ZoneInfo

import httpx
from sqlalchemy.ext.asyncio import AsyncSession

from tests.bookings.test_deposits import DEPOSIT, _drain
from tests.bookings.test_manual_deposit import _post, _unpaid
from tests.bookings.test_public_bookings import API

GRENADA = ZoneInfo("America/Grenada")


async def _agenda_row(
    client: httpx.AsyncClient,
    studio_headers: dict[str, str],
    booking_id: str,
    starts_at: str,
) -> dict:
    local_day = datetime.fromisoformat(starts_at.replace("Z", "+00:00")).astimezone(
        GRENADA
    )
    day = local_day.date().isoformat()
    response = await client.get(
        f"{API}/org/agenda",
        headers=studio_headers,
        params={"from_date": day, "to_date": day},
    )
    assert response.status_code == 200, response.text
    rows = [b for d in response.json()["days"] for b in d["bookings"]]
    matches = [b for b in rows if b["id"] == booking_id]
    assert len(matches) == 1, rows
    return matches[0]


async def test_an_unpaid_deposit_has_zero_captured_and_refunded(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    detail = await async_client.get(
        f"{API}/org/bookings/{booking_id}", headers=studio.headers
    )
    row = await _agenda_row(
        async_client, studio.headers, booking_id, detail.json()["starts_at"]
    )
    assert row["deposit_captured_minor"] == 0
    assert row["deposit_refunded_minor"] == 0


async def test_a_recorded_deposit_shows_as_captured_on_the_agenda(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    assert (await _post(async_client, studio, booking_id)).status_code == 200
    await _drain(db_async)
    detail = await async_client.get(
        f"{API}/org/bookings/{booking_id}", headers=studio.headers
    )
    row = await _agenda_row(
        async_client, studio.headers, booking_id, detail.json()["starts_at"]
    )
    assert row["deposit_captured_minor"] == DEPOSIT
    assert row["deposit_refunded_minor"] == 0
    assert row["deposit_captured_minor"] == detail.json()["deposit_captured_minor"]


async def test_a_refunded_cancellation_shows_the_refund_on_the_agenda(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _unpaid(db_async, async_client)
    assert (await _post(async_client, studio, booking_id)).status_code == 200
    await _drain(db_async)
    cancelled = await async_client.post(
        f"{API}/org/bookings/{booking_id}/cancel",
        headers=studio.headers,
        json={"reason": "Closed", "refund_deposit": True},
    )
    assert cancelled.status_code == 200, cancelled.text
    row = await _agenda_row(
        async_client, studio.headers, booking_id, cancelled.json()["starts_at"]
    )
    assert row["status"] == "cancelled"
    assert row["deposit_captured_minor"] == DEPOSIT
    assert row["deposit_refunded_minor"] == DEPOSIT
