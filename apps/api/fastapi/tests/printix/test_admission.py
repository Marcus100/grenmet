"""Scanner admission: outcomes, exactly-once admission, and event isolation."""

from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.printix import constants
from src.printix.models import PrintixScanLog, PrintixTicket
from src.utils.datetime import utc_now

from .support import (
    SCANNER,
    make_event,
    make_pairing,
    make_ticket,
    outcome_of,
    scan,
)

pytestmark = pytest.mark.usefixtures("db_async")


async def stored_ticket(db: AsyncSession, ticket_id: object) -> PrintixTicket:
    ticket = await db.get(PrintixTicket, ticket_id, populate_existing=True)
    assert ticket is not None
    return ticket


async def test_a_valid_barcode_is_admitted_and_stamped(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001", barcode="PXBAR0001")
    _, secret = await make_pairing(db_async, event, gate="North")

    response = await scan(async_client, secret, "PXBAR0001")

    assert response.status_code == 200
    body = response.json()
    assert body["outcome"] == "admitted"
    assert body["printed_number"] == "001"
    assert body["admitted_gate"] == "North"
    assert body["admitted_at"].endswith("Z")
    stored = await stored_ticket(db_async, ticket.id)
    assert stored.admitted_gate == "North"
    assert stored.admitted_at is not None


async def test_a_second_scan_reports_the_first_admission_time_and_gate(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001")
    _, first_secret = await make_pairing(db_async, event, gate="North")
    _, second_secret = await make_pairing(db_async, event, gate="South")

    first = await scan(async_client, first_secret, "001")
    second = await scan(async_client, second_secret, "001")

    assert outcome_of(first) == "admitted"
    assert outcome_of(second) == "already_admitted"
    assert second.json()["admitted_gate"] == "North"
    assert second.json()["admitted_at"] == first.json()["admitted_at"]


async def test_a_typed_short_number_follows_the_same_path(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "042", barcode="PXBAR0042")
    _, secret = await make_pairing(db_async, event, allow_typed_numbers=True)

    response = await scan(async_client, secret, " 042 ")

    assert outcome_of(response) == "admitted"
    assert response.json()["printed_number"] == "042"


async def test_an_exact_barcode_beats_a_printed_number_that_looks_the_same(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    by_number = await make_ticket(db_async, event, "111", barcode="PXLONGVALUE")
    by_barcode = await make_ticket(db_async, event, "222", barcode="111")
    _, secret = await make_pairing(db_async, event)

    response = await scan(async_client, secret, "111")

    assert response.json()["printed_number"] == "222"
    assert (await stored_ticket(db_async, by_barcode.id)).admitted_at is not None
    assert (await stored_ticket(db_async, by_number.id)).admitted_at is None


async def test_a_void_ticket_is_refused_and_not_admitted(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "005", status="void")
    _, secret = await make_pairing(db_async, event)

    response = await scan(async_client, secret, "005")

    assert outcome_of(response) == "void"
    assert (await stored_ticket(db_async, ticket.id)).admitted_at is None


async def test_an_unknown_value_is_unknown(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    _, secret = await make_pairing(db_async, event)

    response = await scan(async_client, secret, "NOPE")

    assert outcome_of(response) == "unknown"
    assert response.json()["printed_number"] is None
    assert response.json()["admitted_at"] is None


async def test_another_events_ticket_looks_exactly_like_an_unknown_one(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    """A pairing for event A cannot admit event B's tickets, and the answer does
    not reveal that B's ticket exists."""
    event_a = await make_event(db_async, name="A")
    event_b = await make_event(db_async, name="B")
    ticket_b = await make_ticket(db_async, event_b, "007", barcode="PXB-ONLY")
    _, secret_a = await make_pairing(db_async, event_a)

    by_barcode = await scan(async_client, secret_a, "PXB-ONLY")
    by_number = await scan(async_client, secret_a, "007")
    missing = await scan(async_client, secret_a, "NOT-THERE")

    assert outcome_of(by_barcode) == "unknown"
    assert by_barcode.json() == missing.json()
    assert by_number.json() == missing.json()
    assert (await stored_ticket(db_async, ticket_b.id)).admitted_at is None


async def test_a_closed_event_refuses_every_scan(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    ticket = await make_ticket(db_async, event, "001")
    _, secret = await make_pairing(db_async, event)
    event.status = "closed"
    await db_async.commit()

    response = await scan(async_client, secret, "001")

    assert outcome_of(response) == "event_closed"
    assert (await stored_ticket(db_async, ticket.id)).admitted_at is None


async def test_an_event_past_its_close_time_is_closed_even_if_open(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001")
    _, secret = await make_pairing(db_async, event)
    event.closes_at = utc_now() - timedelta(minutes=1)
    await db_async.commit()

    response = await scan(async_client, secret, "001")

    assert outcome_of(response) == "event_closed"


async def test_the_scan_log_keeps_at_most_128_characters(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    _, secret = await make_pairing(db_async, event)
    long_value = "Z" * 200  # longer than the log keeps, shorter than the input limit

    response = await scan(async_client, secret, long_value)

    assert outcome_of(response) == "unknown"
    logged = (
        (
            await db_async.execute(
                select(PrintixScanLog.value).order_by(PrintixScanLog.scanned_at.desc())
            )
        )
        .scalars()
        .first()
    )
    assert logged == "Z" * constants.SCAN_VALUE_LOG_LENGTH


async def test_scan_values_longer_than_the_limit_are_rejected(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    _, secret = await make_pairing(db_async, event)

    response = await async_client.post(
        f"{SCANNER}/admissions",
        headers={"Authorization": f"Bearer {secret}"},
        json={"value": "X" * (constants.SCAN_VALUE_MAX + 1)},
    )

    assert response.status_code == 422


async def test_the_live_summary_follows_admissions(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    event = await make_event(db_async)
    await make_ticket(db_async, event, "001")
    await make_ticket(db_async, event, "002")
    _, secret = await make_pairing(db_async, event, gate="North")
    await scan(async_client, secret, "001")

    response = await async_client.get(
        f"{SCANNER}/summary", headers={"Authorization": f"Bearer {secret}"}
    )

    body = response.json()
    assert response.status_code == 200
    assert body["issued"] == 2
    assert body["admitted"] == 1
    assert body["not_yet_in"] == 1
    assert body["admitted_by_gate"] == [{"gate": "North", "admitted": 1}]
