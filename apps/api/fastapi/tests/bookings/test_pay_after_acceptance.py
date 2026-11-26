"""Bookings: the three ways a business takes money, with and without acceptance.

Two facts decide the flow: whether the business accepts each booking by hand (the
profile's switch, or a new-clients-only service) and who collects (``online`` by
card, or ``business``: paid to the business directly).

1. No acceptance, online: pay at booking, held, confirmed when paid.
2. No acceptance, direct: confirmed; the business marks the deposit received.
3. Acceptance, online: a request first. Nothing is asked and no payment hold
   starts until the business accepts; then the customer pays and that confirms it.
4. Acceptance, direct: a request; accepting confirms it, deposit due to the business.

Service price is 21000 minor and the online deposit 5000 in these tests.
"""

import uuid
from datetime import timedelta
from importlib import import_module

import httpx
import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import deposit_payments, deposits, emails, reminders, transitions
from src.bookings.models import Booking, BookingProfile, BookingStatus, Service
from src.outbox import Outbox
from src.payments.models import IntentStatus, LedgerEntry
from src.utils.datetime import utc_now
from tests.bookings.test_deposits import (
    DEPOSIT,
    _book_deposit,
    _deposit_studio,
    _drain,
    _events,
    _intent,
    _pay_manually,
)
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _booking_for,
    _emails,
    _slots,
    _studio,
)
from tests.email_payload import payload_text
from tests.payments import conftest as payments_conftest

import_module("src.bookings.outbox_handlers")  # registers bookings.deposit_paid
stripe_env = payments_conftest.stripe_env


async def _request(
    db: AsyncSession, client: httpx.AsyncClient, **profile: object
) -> tuple[Studio, dict]:
    """Case 3: a business that accepts by hand and collects online; one request."""
    settings: dict[str, object] = {"requires_confirmation": True, **profile}
    studio = await _deposit_studio(db, client, **settings)
    return studio, await _book_deposit(client, studio, db=db)


async def _accept(
    client: httpx.AsyncClient, studio: Studio, booking_id: str
) -> httpx.Response:
    return await client.post(
        f"{API}/org/bookings/{booking_id}/confirm", headers=studio.headers
    )


async def _manage(client: httpx.AsyncClient, token: str) -> dict:
    response = await client.get(f"{API}/public/bookings/{token}")
    assert response.status_code == 200, response.text
    return response.json()


async def _mail(db: AsyncSession, studio: Studio, key: str) -> Outbox | None:
    return next(
        (row for row in await _emails(db, studio.org_id) if row.dedupe_key == key),
        None,
    )


async def _ledger_rows(db: AsyncSession, studio: Studio) -> int:
    return (
        await db.scalar(
            select(func.count())
            .select_from(LedgerEntry)
            .where(LedgerEntry.organisation_id == studio.org_id)
        )
        or 0
    )


async def _needs_confirming(client: httpx.AsyncClient, studio: Studio) -> list[dict]:
    """What Studio's "Needs confirming" reads: the agenda's ``pending`` bookings."""
    from tests.bookings.booking_day import DAY

    response = await client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={"from_date": DAY, "to_date": DAY, "status": "pending"},
    )
    assert response.status_code == 200, response.text
    return [b for day in response.json()["days"] for b in day["bookings"]]


# --- pure rules ------------------------------------------------------------------------------


def test_the_whole_booking_status_table() -> None:
    # Every legal move, so a change to the table is a deliberate change here too.
    s = BookingStatus
    assert transitions.TRANSITIONS == {
        s.PENDING_PAYMENT: {s.PENDING, s.CONFIRMED, s.CANCELLED},
        s.PENDING: {s.PENDING_PAYMENT, s.CONFIRMED, s.CANCELLED},
        s.CONFIRMED: {s.CANCELLED, s.NO_SHOW, s.COMPLETED},
        s.CANCELLED: set(),
        s.NO_SHOW: set(),
        s.COMPLETED: set(),
    }


def test_only_a_request_can_move_to_awaiting_payment() -> None:
    assert transitions.can_transition(
        BookingStatus.PENDING, BookingStatus.PENDING_PAYMENT
    )
    assert transitions.can_transition(
        BookingStatus.PENDING_PAYMENT, BookingStatus.CONFIRMED
    )
    assert not transitions.can_transition(
        BookingStatus.CONFIRMED, BookingStatus.PENDING_PAYMENT
    )
    assert not transitions.can_transition(
        BookingStatus.CANCELLED, BookingStatus.PENDING_PAYMENT
    )


@pytest.mark.parametrize(
    ("profile_minutes", "online", "to_start", "expected"),
    [
        (None, False, 10_000, 30),
        (600, True, 10_000, 600),  # not the 2-hour cap of a checkout at booking
        (10080, True, 20_000, 1380),  # a checkout link lasts a day
        (10080, False, 20_000, 10080),
        (600, False, 90, 90),  # never past the booking's own start
        (600, False, -5, 1),
    ],
)
def test_the_hold_after_acceptance(
    profile_minutes: int | None, online: bool, to_start: int, expected: int
) -> None:
    assert (
        deposit_payments.accepted_hold_minutes_for(
            profile_minutes, online=online, minutes_to_start=to_start
        )
        == expected
    )


# --- 1. no acceptance, online ----------------------------------------------------------------


async def test_case_1_pay_at_booking_is_held_then_confirmed_when_paid(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking = receipt["booking"]
    assert receipt["payment_required"] is True
    assert booking["status"] == "pending_payment"
    assert booking["pay_after_acceptance"] is False
    assert booking["payment"]["status"] == "due"
    assert booking["hold_ends_at"] is not None
    assert await _needs_confirming(async_client, studio) == []

    intent = await _intent(db_async, booking["id"])
    assert intent is not None
    await _pay_manually(async_client, studio, intent.id)
    await _drain(db_async)
    stored = await _booking_for(db_async, booking["id"])
    assert stored.status == "confirmed"
    assert stored.accepted_at is None


# --- 2. no acceptance, direct ----------------------------------------------------------------


async def test_case_2_direct_payment_is_confirmed_and_marked_received_by_hand(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async,
        async_client,
        deposit_collection="business",
        deposit_mode="fixed",
        deposit_fixed_minor=DEPOSIT,
    )
    slots = await _slots(async_client, studio)
    response = await _book(async_client, studio, slots[0])
    assert response.status_code == 201, response.text
    receipt = response.json()
    booking = receipt["booking"]
    assert receipt["payment_required"] is False
    assert booking["status"] == "confirmed"
    assert booking["deposit_minor"] == 0
    assert booking["deposit_to_business_minor"] == DEPOSIT
    assert booking["pay_after_acceptance"] is False
    assert booking["payment"] is None
    assert await _intent(db_async, booking["id"]) is None

    received = await async_client.post(
        f"{API}/org/bookings/{booking['id']}/deposit-received",
        headers={**studio.headers, "Idempotency-Key": uuid.uuid4().hex},
        json={"method": "cash"},
    )
    assert received.status_code == 200, received.text
    assert received.json()["deposit_received_at"] is not None
    assert await _ledger_rows(db_async, studio) == 0


# --- 3. acceptance, online -------------------------------------------------------------------


async def test_case_3_a_request_asks_for_no_payment_and_starts_no_hold(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client)
    booking = receipt["booking"]

    assert receipt["payment_required"] is False
    assert receipt["checkout_url"] is None
    assert booking["status"] == "pending"
    assert booking["pay_after_acceptance"] is True
    assert booking["deposit_minor"] == DEPOSIT  # what becomes due on acceptance
    assert booking["payment"] is None
    assert booking["hold_ends_at"] is None
    assert booking["hold_minutes"] is None
    assert await _intent(db_async, booking["id"]) is None
    stored = await _booking_for(db_async, booking["id"])
    assert stored.hold_minutes is None
    assert stored.accepted_at is None

    # The business sees it at once, with the amount it will ask for.
    waiting = await _needs_confirming(async_client, studio)
    assert [row["id"] for row in waiting] == [booking["id"]]
    assert waiting[0]["pay_after_acceptance"] is True
    assert waiting[0]["hold_expires_at"] is None

    # Both sides are told about the request; the customer is told they pay later.
    customer = await _mail(db_async, studio, f"booking-confirmation:{booking['id']}")
    assert customer is not None
    text = payload_text(customer.payload)
    assert "We will email you when Babydoll Beauty Bar accepts. You pay then." in text
    assert "Nothing to pay yet. XCD 50.00 is due once your request is accepted." in text
    assert "Deposit paid" not in text
    notice = await _mail(db_async, studio, f"booking-studio-created:{booking['id']}")
    assert notice is not None
    assert notice.payload["subject"].startswith("Booking requested")


async def test_case_3_the_hold_sweeper_leaves_a_request_alone(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client)
    much_later = utc_now() + timedelta(days=3)
    assert (
        await deposits.expire_unpaid(
            db_async, now=much_later, organisation_id=studio.org_id
        )
        == 0
    )
    assert (await _booking_for(db_async, receipt["booking"]["id"])).status == "pending"


async def test_case_3_a_request_is_in_the_reminder_and_says_payment_comes_later(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client)
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    queued = await reminders.enqueue_due_reminders(
        db_async,
        now=booking.starts_at - timedelta(hours=3),
        organisation_id=studio.org_id,
    )
    await db_async.commit()
    assert queued == 1
    row = await _mail(db_async, studio, f"booking-reminder:{booking.id}")
    assert row is not None
    text = payload_text(row.payload)
    assert "has not confirmed it yet" in text
    assert "You pay then." in text


async def test_case_3_accepting_starts_the_hold_and_emails_how_to_pay(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client, deposit_hold_minutes=600)
    booking_id = receipt["booking"]["id"]
    # The request sat for two days: the hold must not run from when it was made.
    made = utc_now() - timedelta(days=2)
    await db_async.execute(
        update(Booking)
        .where(Booking.id == uuid.UUID(booking_id))
        .values(created_at=made)
    )
    await db_async.commit()

    before = utc_now()
    accepted = await _accept(async_client, studio, booking_id)
    assert accepted.status_code == 200, accepted.text
    detail = accepted.json()
    assert detail["status"] == "pending_payment"
    assert detail["pay_after_acceptance"] is True
    assert detail["accepted_at"] is not None
    assert detail["deposit_captured_minor"] == 0

    stored = await _booking_for(db_async, booking_id)
    assert stored.accepted_at is not None and stored.accepted_at >= before
    assert stored.hold_minutes == 600
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    assert intent.amount_minor == DEPOSIT
    assert intent.status == IntentStatus.REQUIRES_PAYMENT.value
    assert await _ledger_rows(db_async, studio) == 0  # accepting charges nothing

    # It left "Needs confirming" and the customer now sees what to pay and by when.
    assert await _needs_confirming(async_client, studio) == []
    view = await _manage(async_client, receipt["manage_token"])
    assert view["status"] == "pending_payment"
    assert view["pay_after_acceptance"] is True
    assert view["payment"]["status"] == "due"
    assert view["payment"]["amount_minor"] == DEPOSIT
    assert view["hold_minutes"] == 600
    expected_end = stored.accepted_at + timedelta(minutes=600)
    assert view["hold_ends_at"].startswith(expected_end.isoformat()[:16])

    mail = await _mail(db_async, studio, f"booking-accepted:{booking_id}")
    assert mail is not None
    assert "accepted your booking request" in mail.payload["subject"]
    text = payload_text(mail.payload)
    assert "Babydoll Beauty Bar has accepted your booking request." in text
    assert "XCD 50.00" in text
    assert "Pay by" in text
    # No Stripe key in this test: the business takes the payment itself.
    assert "will tell you how to pay" in text

    # The sweeper counts from the acceptance, not from two days ago.
    assert (
        await deposits.expire_unpaid(
            db_async,
            now=utc_now() + timedelta(minutes=5),
            organisation_id=studio.org_id,
        )
        == 0
    )
    assert (await _booking_for(db_async, booking_id)).status == "pending_payment"


async def test_case_3_a_card_checkout_after_acceptance_is_not_capped_at_two_hours(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    _ = stripe_env
    studio, receipt = await _request(db_async, async_client, deposit_hold_minutes=600)
    booking_id = receipt["booking"]["id"]
    assert receipt["checkout_url"] is None  # no checkout before acceptance

    assert (await _accept(async_client, studio, booking_id)).status_code == 200
    stored = await _booking_for(db_async, booking_id)
    assert stored.hold_minutes == 600
    view = await _manage(async_client, receipt["manage_token"])
    assert view["payment"]["status"] == "due"
    assert view["payment"]["checkout_url"]

    mail = await _mail(db_async, studio, f"booking-accepted:{booking_id}")
    assert mail is not None
    text = payload_text(mail.payload)
    assert "Pay XCD 50.00 by" in text
    assert "Pay now" in text
    # The link opens the manage page, which carries the pay button.
    assert "https://babydoll.example/manage/" in text


async def test_case_3_paying_after_acceptance_confirms_and_tells_both_sides(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    assert (await _accept(async_client, studio, booking_id)).status_code == 200
    intent = await _intent(db_async, booking_id)
    assert intent is not None

    await _pay_manually(async_client, studio, intent.id)
    assert await _drain(db_async) == 1

    assert (await _booking_for(db_async, booking_id)).status == "confirmed"
    view = await _manage(async_client, receipt["manage_token"])
    assert view["payment"]["status"] == "paid"
    assert view["payment"]["paid_minor"] == DEPOSIT
    confirmed = await _mail(db_async, studio, f"booking-confirmed:{booking_id}")
    assert confirmed is not None
    text = payload_text(confirmed.payload)
    assert "your payment arrived" in text
    assert "Deposit paid XCD 50.00" in text
    studio_mail = await _mail(db_async, studio, f"booking-studio-paid:{booking_id}")
    assert studio_mail is not None
    notes = [event.note for event in await _events(db_async, booking_id)]
    assert notes == [
        "Booked online",
        "Accepted by the business; waiting for payment",
        "Deposit paid",
    ]
    # A replay of the paid topic changes nothing.
    assert (
        await deposits.confirm_paid(
            db_async, organisation_id=studio.org_id, booking_id=uuid.UUID(booking_id)
        )
        == "ignored"
    )


async def test_case_3_an_accepted_request_cannot_be_accepted_or_confirmed_unpaid(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    assert (await _accept(async_client, studio, booking_id)).status_code == 200

    again = await _accept(async_client, studio, booking_id)
    assert again.status_code == 409
    assert "waiting for payment" in again.json()["detail"]
    assert (await _booking_for(db_async, booking_id)).status == "pending_payment"
    assert await _ledger_rows(db_async, studio) == 0


async def test_case_3_an_unpaid_hold_lapses_and_releases_the_slot(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client, deposit_hold_minutes=90)
    booking_id = receipt["booking"]["id"]
    taken = receipt["booking"]["starts_at"]
    assert (await _accept(async_client, studio, booking_id)).status_code == 200
    assert taken not in await _slots(async_client, studio)

    args = {"organisation_id": studio.org_id}
    soon = utc_now() + timedelta(minutes=80)
    assert await deposits.expire_unpaid(db_async, now=soon, **args) == 0
    late = utc_now() + timedelta(minutes=95)
    assert await deposits.expire_unpaid(db_async, now=late, **args) == 1
    await db_async.commit()

    stored = await _booking_for(db_async, booking_id)
    assert stored.status == "cancelled"
    assert stored.cancel_reason == "Deposit not paid in time"
    intent = await _intent(db_async, booking_id)
    assert intent is not None and intent.status == IntentStatus.CANCELLED.value
    assert await _ledger_rows(db_async, studio) == 0
    assert taken in await _slots(async_client, studio)

    customer = await _mail(db_async, studio, f"booking-payment-lapsed:{booking_id}")
    assert customer is not None
    assert "Nothing was charged." in payload_text(customer.payload)
    assert await _mail(db_async, studio, f"booking-studio-unpaid:{booking_id}")
    # Safe to repeat.
    assert await deposits.expire_unpaid(db_async, now=late, **args) == 0


async def test_case_3_a_payment_after_the_hold_lapsed_is_refunded(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    assert (await _accept(async_client, studio, booking_id)).status_code == 200
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    late = utc_now() + timedelta(minutes=45)
    assert (
        await deposits.expire_unpaid(db_async, now=late, organisation_id=studio.org_id)
        == 1
    )
    await db_async.commit()
    assert (
        await deposits.confirm_paid(
            db_async, organisation_id=studio.org_id, booking_id=uuid.UUID(booking_id)
        )
        == "refunded"
    )
    assert (await _booking_for(db_async, booking_id)).status == "cancelled"


async def test_case_3_declining_a_request_charges_and_refunds_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    declined = await async_client.post(
        f"{API}/org/bookings/{booking_id}/decline",
        headers=studio.headers,
        json={"reason": "Fully booked that week"},
    )
    assert declined.status_code == 200, declined.text
    assert declined.json()["status"] == "cancelled"
    assert await _intent(db_async, booking_id) is None
    assert await _ledger_rows(db_async, studio) == 0
    notes = [event.note for event in await _events(db_async, booking_id)]
    assert notes == ["Booked online", "Declined by the business"]  # no money note
    view = await _manage(async_client, receipt["manage_token"])
    assert view["status"] == "cancelled"


async def test_case_3_the_customer_cancels_a_request_with_no_money_note(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    cancelled = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/cancel", json={}
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["status"] == "cancelled"
    assert await _intent(db_async, booking_id) is None
    notes = [event.note for event in await _events(db_async, booking_id)]
    assert notes == ["Booked online", "Cancelled by customer"]
    assert await _ledger_rows(db_async, studio) == 0


async def test_case_3_cancelling_after_acceptance_cancels_the_open_payment(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    assert (await _accept(async_client, studio, booking_id)).status_code == 200
    cancelled = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/cancel", json={}
    )
    assert cancelled.status_code == 200, cancelled.text
    intent = await _intent(db_async, booking_id)
    assert intent is not None and intent.status == IntentStatus.CANCELLED.value
    assert await _ledger_rows(db_async, studio) == 0


async def test_case_3_accepting_with_nothing_due_confirms_directly(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # No deposit on the service and no deposit rule: nothing is ever due.
    studio = await _studio(
        db_async,
        async_client,
        apps=("bookings", "payments"),
        requires_confirmation=True,
    )
    slots = await _slots(async_client, studio)
    response = await _book(async_client, studio, slots[0])
    assert response.status_code == 201, response.text
    booking = response.json()["booking"]
    assert booking["status"] == "pending"
    assert booking["pay_after_acceptance"] is False

    accepted = await _accept(async_client, studio, booking["id"])
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "confirmed"
    assert await _intent(db_async, booking["id"]) is None
    assert await _mail(db_async, studio, f"booking-confirmed:{booking['id']}")
    assert await _mail(db_async, studio, f"booking-accepted:{booking['id']}") is None


async def test_case_3_a_new_clients_only_service_is_a_request_paid_after_acceptance(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The staging case: the profile does not confirm by hand, the service does.
    studio = await _deposit_studio(db_async, async_client)
    await db_async.execute(
        update(Service)
        .where(Service.id == uuid.UUID(studio.service_id))
        .values(new_clients_only=True)
    )
    await db_async.commit()
    storefront = (await async_client.get(f"{API}/public/{studio.slug}")).json()
    assert storefront["services"][0]["pay_after_acceptance"] is True
    assert storefront["services"][0]["due_at_booking_minor"] == DEPOSIT

    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking = receipt["booking"]
    assert booking["status"] == "pending"
    assert booking["pay_after_acceptance"] is True
    assert receipt["payment_required"] is False
    assert booking["payment"] is None
    assert [row["id"] for row in await _needs_confirming(async_client, studio)] == [
        booking["id"]
    ]

    assert (await _accept(async_client, studio, booking["id"])).status_code == 200
    intent = await _intent(db_async, booking["id"])
    assert intent is not None
    await _pay_manually(async_client, studio, intent.id)
    await _drain(db_async)
    # Paying confirms it: it is not sent back to wait for a second acceptance.
    assert (await _booking_for(db_async, booking["id"])).status == "confirmed"


async def test_the_storefront_says_when_payment_follows_acceptance(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    plain = await _deposit_studio(db_async, async_client)
    by_hand = await _deposit_studio(db_async, async_client, requires_confirmation=True)
    direct = await _studio(
        db_async,
        async_client,
        requires_confirmation=True,
        deposit_collection="business",
    )
    flags = []
    for studio in (plain, by_hand, direct):
        body = (await async_client.get(f"{API}/public/{studio.slug}")).json()
        flags.append(body["services"][0]["pay_after_acceptance"])
    # A deposit paid to the business is also asked for only after acceptance.
    assert flags == [False, True, True]


async def test_case_3_another_organisation_cannot_accept_the_request(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client)
    other = await _deposit_studio(db_async, async_client, requires_confirmation=True)
    booking_id = receipt["booking"]["id"]

    response = await _accept(async_client, other, booking_id)
    assert response.status_code == 404

    stored = await _booking_for(db_async, booking_id)
    assert stored.status == "pending"
    assert stored.accepted_at is None
    assert await _intent(db_async, booking_id) is None
    assert await _mail(db_async, studio, f"booking-accepted:{booking_id}") is None
    assert await _mail(db_async, other, f"booking-accepted:{booking_id}") is None


async def test_case_3_a_deposit_recorded_by_hand_before_acceptance_is_not_asked_twice(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _request(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    recorded = await async_client.post(
        f"{API}/org/bookings/{booking_id}/manual-deposit",
        headers={**studio.headers, "Idempotency-Key": uuid.uuid4().hex},
        json={"method": "cash", "reference": "R-9"},
    )
    assert recorded.status_code == 200, recorded.text
    await _drain(db_async)
    stored = await _booking_for(db_async, booking_id)
    assert stored.status == "pending"  # money alone never accepts a request
    assert stored.pay_after_acceptance is False

    accepted = await _accept(async_client, studio, booking_id)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "confirmed"
    assert accepted.json()["deposit_captured_minor"] == DEPOSIT
    assert await _mail(db_async, studio, f"booking-accepted:{booking_id}") is None


async def test_a_booking_paid_before_this_rule_still_waits_for_the_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # A booking made before requests were paid after acceptance: it paid first.
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    booking_id = receipt["booking"]["id"]
    await db_async.execute(
        update(BookingProfile)
        .where(BookingProfile.organisation_id == studio.org_id)
        .values(requires_confirmation=True)
    )
    await db_async.commit()
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    await _pay_manually(async_client, studio, intent.id)
    await _drain(db_async)
    assert (await _booking_for(db_async, booking_id)).status == "pending"

    accepted = await _accept(async_client, studio, booking_id)
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "confirmed"  # paid already: no second ask
    assert await _mail(db_async, studio, f"booking-accepted:{booking_id}") is None


# --- 4. acceptance, direct -------------------------------------------------------------------


async def test_case_4_a_direct_payment_request_is_confirmed_by_accepting(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async,
        async_client,
        requires_confirmation=True,
        deposit_collection="business",
        deposit_instructions="Bank transfer to 123-456.",
        deposit_mode="fixed",
        deposit_fixed_minor=DEPOSIT,
    )
    slots = await _slots(async_client, studio)
    response = await _book(async_client, studio, slots[0])
    assert response.status_code == 201, response.text
    receipt = response.json()
    booking = receipt["booking"]
    assert receipt["payment_required"] is False
    assert booking["status"] == "pending"
    assert booking["pay_after_acceptance"] is False
    assert booking["deposit_minor"] == 0
    assert booking["deposit_to_business_minor"] == DEPOSIT
    assert booking["payment"] is None
    assert booking["hold_ends_at"] is None
    # The amount is stated, but not how to pay it: nothing is asked yet.
    assert booking["deposit_instructions"] is None
    assert [row["id"] for row in await _needs_confirming(async_client, studio)] == [
        booking["id"]
    ]
    request = await _mail(db_async, studio, f"booking-confirmation:{booking['id']}")
    assert request is not None
    text = payload_text(request.payload)
    assert (
        "Nothing to pay yet: you then pay a deposit of XCD 50.00 directly to "
        "Babydoll Beauty Bar." in text
    )
    assert "Bank transfer to 123-456." not in text
    assert "Deposit to pay" not in text

    accepted = await _accept(async_client, studio, booking["id"])
    assert accepted.status_code == 200, accepted.text
    assert accepted.json()["status"] == "confirmed"
    assert await _intent(db_async, booking["id"]) is None
    assert await _ledger_rows(db_async, studio) == 0
    confirmed = await _mail(db_async, studio, f"booking-confirmed:{booking['id']}")
    assert confirmed is not None
    text = payload_text(confirmed.payload)
    assert "Deposit to pay" in text
    assert "Bank transfer to 123-456." in text
    view = await _manage(async_client, receipt["manage_token"])
    assert view["status"] == "confirmed"
    assert view["deposit_to_business_minor"] == DEPOSIT
    assert view["deposit_instructions"] == "Bank transfer to 123-456."
    assert view["deposit_received"] is False


# --- mail wording ----------------------------------------------------------------------------


def test_the_accepted_mail_without_an_online_payment_points_to_the_business() -> None:
    from zoneinfo import ZoneInfo

    mail = emails.BookingEmail(
        business="Babydoll",
        customer_name="Ada Lovelace",
        service_name="Classic full set",
        provider_name="Jeriann",
        starts_at=utc_now().replace(tzinfo=None) + timedelta(days=7),
        tz=ZoneInfo("America/Grenada"),
        manage_url="https://example.test/manage/abc",
        currency="XCD",
    )
    pay_by = utc_now().replace(tzinfo=None) + timedelta(hours=10)
    manual = emails.customer_accepted(
        mail, amount_minor=5000, pay_by=pay_by, pay_url=None
    )
    assert manual.primary is not None and manual.primary.label == "Manage booking"
    online = emails.customer_accepted(
        mail, amount_minor=5000, pay_by=pay_by, pay_url=mail.manage_url
    )
    assert online.primary is not None and online.primary.label == "Pay now"
    assert any("Pay XCD 50.00 by" in line for line in online.paragraphs)
    assert any("(Grenada time)" in line for line in online.paragraphs)
