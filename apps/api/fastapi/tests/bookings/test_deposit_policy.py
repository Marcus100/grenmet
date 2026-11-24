"""Deposit policy (owner request 23 Nov 2026): a non-refundable deposit, a minimum
price for the business-wide deposit rule, and the booking policy text.

Money is checked through the real cancel, move, decline and no-show routes. The
deposit fixtures (DEPOSIT, paying by hand) come from test_deposits.py."""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import deposit_payments, public
from src.bookings.models import Service
from tests.bookings.booking_day import utc_iso
from tests.bookings.test_deposits import (
    DEPOSIT,
    _book_deposit,
    _cancel,
    _deposit_studio,
    _drain,
    _intent,
    _pay_manually,
    _refunded,
)
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _booked,
    _booking_for,
    _emails,
    _slots,
    _studio,
)
from tests.email_payload import payload_html, payload_text

PRICE = 21000


async def _paid(
    db: AsyncSession, client: httpx.AsyncClient, **profile: object
) -> tuple[Studio, dict]:
    """A paid deposit booking (the receipt carries the manage token)."""
    studio = await _deposit_studio(db, client, **profile)
    receipt = await _book_deposit(client, studio, db=db)
    intent = await _intent(db, receipt["booking"]["id"])
    assert intent is not None
    await _pay_manually(client, studio, intent.id)
    await _drain(db)
    return studio, receipt


async def _set_price(db: AsyncSession, studio: Studio, **columns: int) -> None:
    svc = await db.get(Service, uuid.UUID(studio.service_id))
    assert svc is not None
    for name, value in columns.items():
        setattr(svc, name, value)
    await db.commit()


# --- refunds: the non-refundable switch ---------------------------------------------------


@pytest.mark.parametrize("non_refundable", [False, True])
async def test_a_customer_cancel_refunds_unless_the_deposit_is_non_refundable(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    non_refundable: bool,
) -> None:
    _, receipt = await _paid(
        db_async, async_client, deposit_non_refundable=non_refundable
    )
    booking_id = receipt["booking"]["id"]
    cancelled = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/cancel"
    )
    assert cancelled.status_code == 200, cancelled.text
    expected = 0 if non_refundable else DEPOSIT
    assert cancelled.json()["payment"]["refunded_minor"] == expected
    assert await _refunded(db_async, booking_id) == -expected


@pytest.mark.parametrize(
    ("non_refundable", "inside", "override", "refunded"),
    [
        # Today's policy, unchanged while the switch is off.
        (False, False, None, True),
        (False, True, None, False),
        (False, False, False, False),
        (False, True, True, True),
        # Non-refundable: kept whenever the studio cancels without a choice.
        (True, False, None, False),
        (True, True, None, False),
        (True, False, False, False),
        # The studio's explicit choice on one booking still refunds.
        (True, False, True, True),
        (True, True, True, True),
    ],
)
async def test_a_studio_cancel_follows_the_policy_matrix(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    non_refundable: bool,
    inside: bool,
    override: bool | None,
    refunded: bool,
) -> None:
    studio, receipt = await _paid(
        db_async, async_client, deposit_non_refundable=non_refundable
    )
    booking_id = receipt["booking"]["id"]
    if inside:
        booking = await _booking_for(db_async, booking_id)
        monkeypatch.setattr(
            "src.bookings.studio.utc_now",
            lambda: booking.starts_at - timedelta(hours=2),
        )
    body: dict[str, object] = {"reason": "Studio closed"}
    if override is not None:
        body["refund_deposit"] = override
    response = await async_client.post(
        f"{API}/org/bookings/{booking_id}/cancel", headers=studio.headers, json=body
    )
    assert response.status_code == 200, response.text
    expected = DEPOSIT if refunded else 0
    assert response.json()["deposit_refunded_minor"] == expected
    assert await _refunded(db_async, booking_id) == -expected


async def test_a_decline_always_refunds_even_when_non_refundable(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    # The business refused the booking, so the customer is not charged for it.
    studio, receipt = await _paid(
        db_async,
        async_client,
        requires_confirmation=True,
        deposit_non_refundable=True,
    )
    booking_id = receipt["booking"]["id"]
    declined = await async_client.post(
        f"{API}/org/bookings/{booking_id}/decline",
        headers=studio.headers,
        json={"reason": "No capacity"},
    )
    assert declined.status_code == 200, declined.text
    assert await _refunded(db_async, booking_id) == -DEPOSIT


async def test_a_no_show_keeps_a_deposit_whatever_the_policy(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _paid(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    marked = await async_client.post(
        f"{API}/org/bookings/{booking_id}/no-show", headers=studio.headers
    )
    assert marked.status_code == 200, marked.text
    assert marked.json()["status"] == "no_show"
    assert await _refunded(db_async, booking_id) == 0


# --- moves keep the deposit ---------------------------------------------------------------


async def test_a_customer_move_keeps_a_non_refundable_deposit_with_the_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _paid(db_async, async_client, deposit_non_refundable=True)
    booking_id = receipt["booking"]["id"]
    token = receipt["manage_token"]
    slots = await _slots(async_client, studio)
    moved = await async_client.post(
        f"{API}/public/bookings/{token}/reschedule", json={"starts_at": slots[-1]}
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["status"] == "confirmed"
    assert moved.json()["payment"]["paid_minor"] == DEPOSIT
    assert moved.json()["payment"]["refunded_minor"] == 0
    assert await _refunded(db_async, booking_id) == 0

    # The deposit then stays on the moved booking when the customer cancels.
    cancelled = await async_client.post(f"{API}/public/bookings/{token}/cancel")
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["payment"]["refunded_minor"] == 0
    assert await _refunded(db_async, booking_id) == 0


async def test_a_customer_move_inside_the_cutoff_is_refused_with_the_policy(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _, receipt = await _paid(db_async, async_client, deposit_non_refundable=True)
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    monkeypatch.setattr(
        public, "utc_now", lambda: booking.starts_at - timedelta(hours=2)
    )
    refused = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/reschedule",
        json={"starts_at": utc_iso(15)},
    )
    assert refused.status_code == 409, refused.text
    assert "up to 24 hours" in refused.json()["detail"]


async def test_a_staff_move_keeps_the_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _paid(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    slots = await _slots(async_client, studio)
    moved = await async_client.post(
        f"{API}/org/bookings/{booking_id}/reschedule",
        headers=studio.headers,
        json={"starts_at": slots[-1]},
    )
    assert moved.status_code == 200, moved.text
    assert moved.json()["status"] == "confirmed"
    assert moved.json()["deposit_captured_minor"] == DEPOSIT
    assert moved.json()["deposit_refunded_minor"] == 0
    assert await _refunded(db_async, booking_id) == 0


# --- the business-wide rule and the minimum price -----------------------------------------


async def test_a_minimum_price_leaves_cheap_services_without_a_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async,
        async_client,
        deposit_mode="fixed",
        deposit_fixed_minor=4000,
        deposit_min_price_minor=5000,
        apps=("bookings", "payments"),
    )
    await _set_price(db_async, studio, price_minor=1500)  # EC$15 waxing
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.status_code == 200, storefront.text
    assert [s["due_at_booking_minor"] for s in storefront.json()["services"]] == [0]

    # Nothing is due, so no emailed code is asked for.
    receipt = await _book_deposit(async_client, studio, db=db_async, verify=False)
    assert receipt["booking"]["deposit_minor"] == 0
    assert receipt["booking"]["status"] == "confirmed"


async def test_a_price_at_the_minimum_takes_the_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async,
        async_client,
        deposit_mode="fixed",
        deposit_fixed_minor=4000,
        deposit_min_price_minor=5000,
        apps=("bookings", "payments"),
    )
    await _set_price(db_async, studio, price_minor=5000)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    assert receipt["booking"]["deposit_minor"] == 4000
    assert receipt["booking"]["status"] == "pending_payment"


async def test_a_service_deposit_wins_even_below_the_minimum_price(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async,
        async_client,
        deposit_mode="percent",
        deposit_percent=50,
        deposit_min_price_minor=5000,
        apps=("bookings", "payments"),
    )
    await _set_price(db_async, studio, price_minor=1500, deposit_minor=1000)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    assert receipt["booking"]["deposit_minor"] == 1000


async def test_a_percent_rule_ignores_services_below_the_minimum(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async,
        async_client,
        deposit_mode="percent",
        deposit_percent=50,
        deposit_min_price_minor=5000,
        apps=("bookings", "payments"),
    )
    receipt = await _book_deposit(async_client, studio, db=db_async)
    assert receipt["booking"]["deposit_minor"] == PRICE // 2


# --- the booking policy text --------------------------------------------------------------


async def test_the_policy_is_stored_as_plain_text_with_line_breaks(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    body = await _profile_body(async_client, studio)
    body["booking_policy"] = "Late fee: EC$20.\r\n\r\nNo-shows pay in full.  "
    saved = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=body
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["booking_policy"] == "Late fee: EC$20.\n\nNo-shows pay in full."


async def test_blank_or_null_clears_the_policy_and_omitting_it_keeps_it(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, booking_policy="Keep me")
    kept = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={"public_slug": studio.slug, "display_name": "Babydoll Beauty Bar"},
    )
    assert kept.json()["booking_policy"] == "Keep me"
    cleared = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={**await _profile_body(async_client, studio), "booking_policy": "   "},
    )
    assert cleared.status_code == 200, cleared.text
    assert cleared.json()["booking_policy"] is None


@pytest.mark.parametrize(("text", "ok"), [("a" * 1000, True), ("a" * 1001, False)])
async def test_the_policy_length_is_capped_at_1000_characters(
    db_async: AsyncSession, async_client: httpx.AsyncClient, text: str, ok: bool
) -> None:
    studio = await _studio(db_async, async_client)
    body = await _profile_body(async_client, studio)
    body["booking_policy"] = text
    response = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=body
    )
    assert response.status_code == (200 if ok else 422), response.text


async def test_policy_html_is_stored_as_text_and_escaped_in_the_mail(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    text = 'Pay <img src="x" onerror="boom"> & "bring" the late fee'
    studio, receipt, _ = await _booked(db_async, async_client, booking_policy=text)
    stored = await async_client.get(f"{API}/org/profile", headers=studio.headers)
    assert stored.json()["booking_policy"] == text
    rows = await _emails(db_async, studio.org_id)
    customer = next(r for r in rows if r.dedupe_key.startswith("booking-confirmation:"))
    html = payload_html(customer.payload)
    assert "<img" not in html
    assert "&lt;img" in html
    assert "Pay &lt;img" in html
    assert "Pay <img" in payload_text(customer.payload)


async def test_the_confirmation_mail_carries_the_policy_text(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, _, _ = await _booked(
        db_async, async_client, booking_policy="Late fee: EC$20 after 15 minutes."
    )
    rows = await _emails(db_async, studio.org_id)
    customer = next(r for r in rows if r.dedupe_key.startswith("booking-confirmation:"))
    assert "Late fee: EC$20 after 15 minutes." in payload_text(customer.payload)


async def test_the_mail_says_a_deposit_is_non_refundable_once_it_is_paid(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _paid(db_async, async_client, deposit_non_refundable=True)
    rows = await _emails(db_async, studio.org_id)
    confirmation = next(
        r
        for r in rows
        if r.dedupe_key == f"booking-confirmation:{receipt['booking']['id']}"
    )
    assert "Your deposit is non-refundable." in payload_text(confirmation.payload)


# --- the threshold, without a database --------------------------------------------------


def test_the_minimum_price_is_inclusive_and_a_service_deposit_still_wins() -> None:
    rule = deposit_payments.DepositRule(
        mode="fixed", fixed_minor=4000, min_price_minor=5000
    )
    assert deposit_payments.rule_deposit(4999, rule) == 0
    assert deposit_payments.rule_deposit(5000, rule) == 4000
    cheap = Service(price_minor=1500, deposit_minor=1000)
    assert deposit_payments.planned_deposit(cheap, rule) == 1000
    plain = Service(price_minor=1500, deposit_minor=0)
    assert deposit_payments.planned_deposit(plain, rule) == 0


# --- defaults and tenant isolation ----------------------------------------------------------


async def test_a_profile_without_the_new_fields_keeps_today_s_behaviour(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    profile = (
        await async_client.get(f"{API}/org/profile", headers=studio.headers)
    ).json()
    assert profile["deposit_non_refundable"] is False
    assert profile["deposit_min_price_minor"] is None
    assert profile["booking_policy"] is None
    _, receipt = await _paid(db_async, async_client)
    cancelled = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/cancel"
    )
    assert cancelled.json()["payment"]["refunded_minor"] == DEPOSIT


async def test_another_business_cannot_see_or_change_these_settings(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    mine = await _studio(
        db_async,
        async_client,
        deposit_non_refundable=True,
        deposit_min_price_minor=5000,
        booking_policy="Mine only",
    )
    theirs = await _studio(db_async, async_client)
    profile = (
        await async_client.get(f"{API}/org/profile", headers=theirs.headers)
    ).json()
    assert profile["booking_policy"] is None
    assert profile["deposit_non_refundable"] is False
    assert profile["deposit_min_price_minor"] is None
    # Their studio cannot reorder my services (404), so my settings stay untouched.
    foreign = await async_client.put(
        f"{API}/org/services/order",
        headers=theirs.headers,
        json={"ids": [mine.service_id]},
    )
    assert foreign.status_code == 404, foreign.text
    mine_now = (
        await async_client.get(f"{API}/org/profile", headers=mine.headers)
    ).json()
    assert mine_now["booking_policy"] == "Mine only"
    assert mine_now["deposit_non_refundable"] is True


async def _profile_body(client: httpx.AsyncClient, studio: Studio) -> dict:
    profile = (await client.get(f"{API}/org/profile", headers=studio.headers)).json()
    return {
        key: value
        for key, value in profile.items()
        if key not in {"id", "organisation_id", "created_at", "updated_at"}
    }


# --- the terms a booking was made on (owner review 23 Nov 2026) ----------------------------


async def _set_flag(client: httpx.AsyncClient, studio: Studio, value: bool) -> None:
    body = {**await _profile_body(client, studio), "deposit_non_refundable": value}
    response = await client.put(f"{API}/org/profile", headers=studio.headers, json=body)
    assert response.status_code == 200, response.text


async def test_a_booking_keeps_the_terms_it_was_made_on_when_the_switch_goes_off(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _paid(db_async, async_client, deposit_non_refundable=True)
    booking_id = receipt["booking"]["id"]
    await _set_flag(async_client, studio, False)
    cancelled = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/cancel"
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["payment"]["refunded_minor"] == 0
    assert await _refunded(db_async, booking_id) == 0


async def test_a_booking_made_before_the_switch_is_refunded_after_it_is_turned_on(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _paid(db_async, async_client)
    booking_id = receipt["booking"]["id"]
    await _set_flag(async_client, studio, True)
    cancelled = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/cancel"
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["payment"]["refunded_minor"] == DEPOSIT
    assert await _refunded(db_async, booking_id) == -DEPOSIT


async def test_a_customer_cancel_of_an_unaccepted_request_refunds_the_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _paid(
        db_async,
        async_client,
        requires_confirmation=True,
        deposit_non_refundable=True,
    )
    booking_id = receipt["booking"]["id"]
    pending = await async_client.get(f"{API}/public/bookings/{receipt['manage_token']}")
    assert pending.json()["status"] == "pending"
    cancelled = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/cancel"
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["payment"]["refunded_minor"] == DEPOSIT
    assert await _refunded(db_async, booking_id) == -DEPOSIT


async def test_a_studio_cancel_of_an_unaccepted_request_follows_the_cutoff(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _paid(
        db_async,
        async_client,
        requires_confirmation=True,
        deposit_non_refundable=True,
    )
    booking_id = receipt["booking"]["id"]
    cancelled = await _cancel(async_client, studio, booking_id)
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["deposit_refunded_minor"] == DEPOSIT


async def test_a_confirmed_booking_keeps_its_deposit_on_a_customer_cancel(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _paid(
        db_async,
        async_client,
        requires_confirmation=True,
        deposit_non_refundable=True,
    )
    booking_id = receipt["booking"]["id"]
    confirmed = await async_client.post(
        f"{API}/org/bookings/{booking_id}/confirm", headers=studio.headers
    )
    assert confirmed.status_code == 200, confirmed.text
    cancelled = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/cancel"
    )
    assert cancelled.status_code == 200, cancelled.text
    assert cancelled.json()["payment"]["refunded_minor"] == 0
    assert await _refunded(db_async, booking_id) == 0


async def test_the_studio_detail_shows_the_booking_terms(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _paid(db_async, async_client, deposit_non_refundable=True)
    await _set_flag(async_client, studio, False)
    detail = await async_client.get(
        f"{API}/org/bookings/{receipt['booking']['id']}", headers=studio.headers
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["deposit_non_refundable"] is True


async def test_an_unaccepted_request_mail_says_the_promise_waits_for_confirmation(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt = await _paid(
        db_async,
        async_client,
        requires_confirmation=True,
        deposit_non_refundable=True,
    )
    rows = await _emails(db_async, studio.org_id)
    mail = next(r for r in rows if r.dedupe_key.startswith("booking-confirmation:"))
    text = payload_text(mail.payload)
    assert "Your deposit is non-refundable once your booking is confirmed." in text
