"""The agenda says what money a booking holds, so staff do not open every one (#1939).

A cancelled booking paid online by card can hold a customer's money (refund owed),
have given it back (refunded), or never have taken any. The agenda used to carry no
amount, so staff opened each booking to tell. ``deposit_captured_minor`` and
``deposit_refunded_minor`` mean what they do on the booking detail.
"""

from datetime import timedelta
from typing import Any

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import deposit_payments
from src.payments import service as payments_service
from tests.bookings.booking_day import DAY
from tests.bookings.test_deposits import (
    DEPOSIT,
    _book_deposit,
    _cancel,
    _deposit_studio,
    _drain,
    _intent,
    _paid_booking,
    _pay_manually,
)
from tests.bookings.test_pay_after_acceptance import _request
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _booking_for,
    _slots,
    _studio,
)


async def _agenda(client: httpx.AsyncClient, studio: Studio) -> dict[str, dict]:
    """The day's agenda items keyed by booking id."""
    response = await client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={"from_date": DAY, "to_date": DAY},
    )
    assert response.status_code == 200, response.text
    return {b["id"]: b for day in response.json()["days"] for b in day["bookings"]}


async def test_a_paid_booking_shows_what_was_taken(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _paid_booking(db_async, async_client)

    item = (await _agenda(async_client, studio))[booking_id]

    assert item["deposit_captured_minor"] == DEPOSIT
    assert item["deposit_refunded_minor"] == 0


async def test_a_cancellation_that_was_refunded_shows_the_refund(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, booking_id = await _paid_booking(db_async, async_client)
    assert (await _cancel(async_client, studio, booking_id)).status_code == 200

    item = (await _agenda(async_client, studio))[booking_id]

    assert item["status"] == "cancelled"
    assert item["deposit_captured_minor"] == DEPOSIT
    assert item["deposit_refunded_minor"] == DEPOSIT


async def test_a_cancellation_that_kept_the_deposit_shows_money_still_held(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """The case the agenda could not tell before: cancelled, card captured, no refund."""
    studio, booking_id = await _paid_booking(db_async, async_client)
    cancelled = await _cancel(async_client, studio, booking_id, refund_deposit=False)
    assert cancelled.status_code == 200, cancelled.text

    item = (await _agenda(async_client, studio))[booking_id]

    assert item["status"] == "cancelled"
    assert item["deposit_captured_minor"] == DEPOSIT
    assert item["deposit_refunded_minor"] == 0


async def test_a_booking_that_was_never_paid_has_no_payment(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    assert (await _cancel(async_client, studio, booking_id)).status_code == 200

    item = (await _agenda(async_client, studio))[booking_id]

    assert item["status"] == "cancelled"
    assert item["deposit_captured_minor"] == 0
    assert item["deposit_refunded_minor"] == 0


async def test_a_booking_with_no_deposit_reads_as_zero(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    response = await _book(async_client, studio, starts_at)
    assert response.status_code == 201, response.text
    booking_id = response.json()["booking"]["id"]

    item = (await _agenda(async_client, studio))[booking_id]

    assert item["deposit_minor"] == 0
    assert item["deposit_captured_minor"] == 0
    assert item["deposit_refunded_minor"] == 0


async def test_each_booking_on_a_page_gets_its_own_totals(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Two bookings in one studio, one refunded and one kept: a mix-up between rows
    would show here, and the page must cost one batched lookup, not one per booking."""
    studio = await _deposit_studio(db_async, async_client)
    ids: list[str] = []
    for slot in (0, 1):
        receipt = await _book_deposit(async_client, studio, slot, db=db_async)
        booking_id = receipt["booking"]["id"]
        intent = await _intent(db_async, booking_id)
        assert intent is not None
        await _pay_manually(async_client, studio, intent.id)
        ids.append(booking_id)
    await _drain(db_async)

    assert (await _cancel(async_client, studio, ids[0])).status_code == 200
    kept = await _cancel(async_client, studio, ids[1], refund_deposit=False)
    assert kept.status_code == 200, kept.text

    calls: list[int] = []
    real = payments_service.find_by_idempotency_keys

    async def counting(*args: Any, **kwargs: Any) -> Any:
        calls.append(1)
        return await real(*args, **kwargs)

    monkeypatch.setattr(payments_service, "find_by_idempotency_keys", counting)
    items = await _agenda(async_client, studio)

    assert items[ids[0]]["deposit_refunded_minor"] == DEPOSIT
    assert items[ids[1]]["deposit_refunded_minor"] == 0
    assert items[ids[0]]["deposit_captured_minor"] == DEPOSIT
    assert items[ids[1]]["deposit_captured_minor"] == DEPOSIT
    assert len(calls) == 1


async def test_deposit_totals_skips_a_booking_with_no_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    response = await _book(async_client, studio, starts_at)
    booking = await _booking_for(db_async, response.json()["booking"]["id"])

    assert await deposit_payments.deposit_totals(db_async, [booking]) == {}
    assert await deposit_payments.deposit_totals(db_async, []) == {}


async def test_a_booking_inside_the_cutoff_still_reports_its_captured_money(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The default cancellation inside the cutoff keeps the deposit: the agenda must
    say money is held without anyone choosing `refund_deposit=False`."""
    studio, booking_id = await _paid_booking(db_async, async_client)
    booking = await _booking_for(db_async, booking_id)
    monkeypatch.setattr(
        "src.bookings.studio.utc_now", lambda: booking.starts_at - timedelta(hours=2)
    )
    assert (await _cancel(async_client, studio, booking_id)).status_code == 200

    item = (await _agenda(async_client, studio))[booking_id]

    assert item["deposit_captured_minor"] == DEPOSIT
    assert item["deposit_refunded_minor"] == 0


async def test_a_request_owing_a_deposit_but_with_no_payment_yet_reads_as_zero(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """A request paid by card after the business accepts it owes a deposit but has no
    payment intent until then: both amounts are 0, and `deposit_minor` still says what
    becomes due. Pins the `deposit_minor > 0` lookup against a booking with no intent."""
    studio, receipt = await _request(db_async, async_client)
    booking_id = receipt["booking"]["id"]

    item = (await _agenda(async_client, studio))[booking_id]

    assert item["status"] == "pending"
    assert item["deposit_minor"] == DEPOSIT
    assert item["deposit_captured_minor"] == 0
    assert item["deposit_refunded_minor"] == 0
