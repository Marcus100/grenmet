"""Take payment at booking (#1372, Stripe test mode): the profile setting, the
full-price charge, the return address, and the paid/unpaid state on the manage page.

With no Stripe test key nothing changes: ``full_price`` then acts as ``deposit``."""

import uuid
from datetime import timedelta
from importlib import import_module
from urllib.parse import parse_qs, urlsplit

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import deposit_payments, deposits
from src.bookings.config import bookings_settings
from src.bookings.models import BookingPaymentMode, BookingStatus
from src.payments.models import IntentStatus
from src.utils.datetime import utc_now
from tests.bookings.email_code_helpers import get_proof
from tests.bookings.test_deposits import (
    DEPOSIT,
    PAYMENTS,
    _book_deposit,
    _deposit_studio,
    _drain,
    _intent,
)
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _body,
    _book,
    _booking_for,
    _slots,
    _studio,
)
from tests.factories import make_user
from tests.organisations.support import headers_for
from tests.payments import conftest as payments_conftest

import_module("src.bookings.outbox_handlers")  # registers bookings.deposit_paid
stripe_env = payments_conftest.stripe_env
PRICE = 21000  # the helper studio's service price


async def _full_price_studio(
    db: AsyncSession,
    client: httpx.AsyncClient,
    *,
    apps: tuple[str, ...] = ("bookings", "payments"),
) -> Studio:
    return await _studio(db, client, apps=apps, payment_at_booking="full_price")


async def _book_with_proof(
    db: AsyncSession, client: httpx.AsyncClient, studio: Studio
) -> httpx.Response:
    slots = await _slots(client, studio)
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    proof = await get_proof(db, client, studio, slots[0], email)
    return await _book(
        client, studio, slots[0], customer_email=email, email_proof=proof
    )


async def _manage(client: httpx.AsyncClient, token: str) -> dict:
    response = await client.get(f"{API}/public/bookings/{token}")
    assert response.status_code == 200, response.text
    return response.json()


# --- the setting -----------------------------------------------------------------------


async def test_the_profile_defaults_to_deposit_and_keeps_the_setting(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    profile = await async_client.get(f"{API}/org/profile", headers=studio.headers)
    assert profile.json()["payment_at_booking"] == "deposit"

    body = {
        key: value
        for key, value in profile.json().items()
        if key not in {"id", "organisation_id", "created_at", "updated_at"}
    }
    body["payment_at_booking"] = "full_price"
    saved = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=body
    )
    assert saved.status_code == 200, saved.text
    assert saved.json()["payment_at_booking"] == "full_price"

    # An older client that does not send the field keeps the stored value.
    body.pop("payment_at_booking")
    kept = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=body
    )
    assert kept.json()["payment_at_booking"] == "full_price"

    body["payment_at_booking"] = "everything"
    refused = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=body
    )
    assert refused.status_code == 422


# --- no Stripe keys: nothing changes ------------------------------------------------------


async def test_full_price_without_stripe_keys_changes_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _full_price_studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    # No emailed code is needed, because nothing is due.
    response = await _book(async_client, studio, starts_at)
    assert response.status_code == 201, response.text
    receipt = response.json()
    assert receipt["payment_required"] is False
    assert receipt["checkout_url"] is None
    assert receipt["booking"]["status"] == "confirmed"
    assert receipt["booking"]["deposit_minor"] == 0
    assert receipt["booking"]["payment"] is None
    assert await _intent(db_async, receipt["booking"]["id"]) is None


async def test_full_price_without_stripe_keeps_a_service_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(
        db_async, async_client, payment_at_booking="full_price"
    )
    receipt = (await _book_with_proof(db_async, async_client, studio)).json()
    assert receipt["booking"]["deposit_minor"] == DEPOSIT
    assert receipt["checkout_url"] is None  # the studio records it by hand


async def test_full_price_needs_the_payments_entitlement(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    studio = await _full_price_studio(db_async, async_client, apps=("bookings",))
    starts_at = (await _slots(async_client, studio))[0]
    receipt = (await _book(async_client, studio, starts_at)).json()
    assert receipt["payment_required"] is False
    assert receipt["booking"]["status"] == "confirmed"
    assert stripe_env.requests == []


# --- Stripe test mode ---------------------------------------------------------------------


async def test_full_price_opens_a_stripe_checkout_for_the_price(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    studio = await _full_price_studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    # The full price is money due, so the emailed code is required first.
    unverified = await _book(async_client, studio, starts_at)
    assert unverified.status_code == 403

    response = await _book_with_proof(db_async, async_client, studio)
    assert response.status_code == 201, response.text
    receipt = response.json()
    booking_id = receipt["booking"]["id"]
    assert receipt["payment_required"] is True
    assert receipt["checkout_url"] == "https://checkout.stripe.com/c/pay/cs_test_1"
    assert receipt["booking"]["status"] == "pending_payment"
    assert receipt["booking"]["deposit_minor"] == PRICE
    assert receipt["booking"]["payment"] == {
        "status": "due",
        "amount_minor": PRICE,
        "paid_minor": 0,
        "refunded_minor": 0,
        "balance_at_salon_minor": 0,
        "currency": "XCD",
        "checkout_url": "https://checkout.stripe.com/c/pay/cs_test_1",
    }

    intent = await _intent(db_async, booking_id)
    assert intent is not None
    assert intent.amount_minor == PRICE
    assert intent.currency == "XCD"
    assert intent.provider == "stripe"

    form = stripe_env.form()
    assert form["line_items[0][price_data][currency]"] == "xcd"
    assert form["line_items[0][price_data][unit_amount]"] == str(PRICE)
    assert (
        form["line_items[0][price_data][product_data][name]"]
        == "Payment: Classic full set, Babydoll Beauty Bar"
    )
    # Stripe sends the customer back to the bookings app's return page.
    for field, result in (("success_url", "paid"), ("cancel_url", "cancelled")):
        parts = urlsplit(form[field])
        assert f"{parts.scheme}://{parts.netloc}" == bookings_settings.APP_URL
        assert parts.path == "/checkout/return"
        assert parse_qs(parts.query) == {"booking": [booking_id], "result": [result]}
    # Nothing secret leaves for Stripe: no key, no manage token, no email address.
    sent = stripe_env.requests[-1].content.decode()
    assert receipt["manage_token"] not in sent
    assert "example.com" not in sent


async def test_the_manage_page_shows_due_then_paid(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    _ = stripe_env
    studio = await _full_price_studio(db_async, async_client)
    receipt = (await _book_with_proof(db_async, async_client, studio)).json()
    token = receipt["manage_token"]
    booking_id = receipt["booking"]["id"]
    due = await _manage(async_client, token)
    assert due["payment"]["status"] == "due"
    assert due["payment"]["checkout_url"] is not None

    intent = await _intent(db_async, booking_id)
    assert intent is not None
    body, headers = payments_conftest.signed(
        payments_conftest.checkout_completed(intent.id, amount=PRICE)
    )
    hook = await async_client.post(
        f"{PAYMENTS}/public/webhooks/stripe", content=body, headers=headers
    )
    assert hook.status_code == 200, hook.text
    # A replayed webhook is answered and changes nothing.
    again = await async_client.post(
        f"{PAYMENTS}/public/webhooks/stripe", content=body, headers=headers
    )
    assert again.status_code == 200
    assert await _drain(db_async) == 1

    paid = await _manage(async_client, token)
    assert paid["status"] == "confirmed"
    assert paid["payment"] == {
        "status": "paid",
        "amount_minor": PRICE,
        "paid_minor": PRICE,
        "refunded_minor": 0,
        "balance_at_salon_minor": 0,
        "currency": "XCD",
        "checkout_url": None,
    }


async def test_an_unsigned_webhook_confirms_nothing(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    _ = stripe_env
    studio = await _full_price_studio(db_async, async_client)
    receipt = (await _book_with_proof(db_async, async_client, studio)).json()
    intent = await _intent(db_async, receipt["booking"]["id"])
    assert intent is not None
    body, headers = payments_conftest.signed(
        payments_conftest.checkout_completed(intent.id, amount=PRICE),
        secret="whsec_someone_else",
    )
    response = await async_client.post(
        f"{PAYMENTS}/public/webhooks/stripe", content=body, headers=headers
    )
    assert response.status_code >= 400
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    assert booking.status == BookingStatus.PENDING_PAYMENT.value


async def test_an_expired_hold_shows_unpaid(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    _ = stripe_env
    studio = await _full_price_studio(db_async, async_client)
    receipt = (await _book_with_proof(db_async, async_client, studio)).json()
    later = utc_now() + timedelta(minutes=31)
    assert (
        await deposits.expire_unpaid(db_async, now=later, organisation_id=studio.org_id)
        == 1
    )
    await db_async.commit()

    view = await _manage(async_client, receipt["manage_token"])
    assert view["status"] == "cancelled"
    assert view["payment"]["status"] == "unpaid"
    assert view["payment"]["checkout_url"] is None
    intent = await _intent(db_async, receipt["booking"]["id"])
    assert intent is not None
    assert intent.status == IntentStatus.CANCELLED.value


# --- what the pages are told -----------------------------------------------------------


async def _storefront_due(client: httpx.AsyncClient, studio: Studio) -> int:
    response = await client.get(f"{API}/public/{studio.slug}")
    assert response.status_code == 200, response.text
    (service,) = response.json()["services"]
    return service["due_at_booking_minor"]


async def _card_payments(client: httpx.AsyncClient, studio: Studio) -> bool:
    response = await client.get(f"{API}/org/settings", headers=studio.headers)
    assert response.status_code == 200, response.text
    return response.json()["card_payments_available"]


async def test_the_storefront_and_settings_follow_the_card_rail(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _full_price_studio(db_async, async_client)
    assert await _storefront_due(async_client, studio) == 0
    assert await _card_payments(async_client, studio) is False


async def test_the_storefront_shows_the_full_price_with_stripe(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    _ = stripe_env
    studio = await _full_price_studio(db_async, async_client)
    assert await _storefront_due(async_client, studio) == PRICE
    assert await _card_payments(async_client, studio) is True
    deposit_only = await _deposit_studio(db_async, async_client)
    assert await _storefront_due(async_client, deposit_only) == DEPOSIT
    unentitled = await _full_price_studio(db_async, async_client, apps=("bookings",))
    assert await _storefront_due(async_client, unentitled) == 0


# --- wording the studio, the account and the ledger rely on ---------------------------------


async def _paid_by_stripe(
    db: AsyncSession, client: httpx.AsyncClient, booking_id: str, amount: int
) -> None:
    intent = await _intent(db, booking_id)
    assert intent is not None
    body, headers = payments_conftest.signed(
        payments_conftest.checkout_completed(intent.id, amount=amount)
    )
    hook = await client.post(
        f"{PAYMENTS}/public/webhooks/stripe", content=body, headers=headers
    )
    assert hook.status_code == 200, hook.text
    assert await _drain(db) == 1


async def test_full_price_is_a_payment_for_the_studio_and_the_ledger(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = stripe_env
    studio = await _full_price_studio(db_async, async_client)
    receipt = (await _book_with_proof(db_async, async_client, studio)).json()
    booking_id = receipt["booking"]["id"]
    await _paid_by_stripe(db_async, async_client, booking_id, PRICE)

    detail = await async_client.get(
        f"{API}/org/bookings/{booking_id}", headers=studio.headers
    )
    assert detail.json()["payment_kind"] == "payment"
    assert "Payment paid" in [e["note"] for e in detail.json()["events"]]
    cancelled = await async_client.post(
        f"{API}/org/bookings/{booking_id}/cancel",
        headers=studio.headers,
        json={"reason": "Studio closed"},
    )
    assert cancelled.status_code == 200, cancelled.text
    assert "Payment refunded" in [e["note"] for e in cancelled.json()["events"]]

    ledger = await async_client.get(
        f"{PAYMENTS}/admin/ledger?organisation_id={studio.org_id}&kind=charge",
        headers=superuser_token_headers_async,
    )
    (charge,) = ledger.json()["data"]
    assert charge["source_type"] == "bookings.deposit"
    assert charge["source_id"] == booking_id
    assert charge["description"] == "Payment: Classic full set, Babydoll Beauty Bar"


async def test_a_deposit_stays_a_deposit_for_the_studio(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _deposit_studio(db_async, async_client)
    receipt = await _book_deposit(async_client, studio, db=db_async)
    detail = await async_client.get(
        f"{API}/org/bookings/{receipt['booking']['id']}",
        headers=studio.headers,
    )
    assert detail.json()["payment_kind"] == "deposit"


async def test_my_bookings_carry_the_payment_and_only_the_callers(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
) -> None:
    studio = await _full_price_studio(db_async, async_client)
    ada = await make_user(db_async, email=f"ada-{uuid.uuid4().hex[:6]}@example.com")
    bob = await make_user(db_async, email=f"bob-{uuid.uuid4().hex[:6]}@example.com")
    # Read once: the commits below expire the user objects.
    people = {
        "ada": (ada.email, headers_for(ada), 0, "cs_test_1"),
        "bob": (bob.email, headers_for(bob), -1, "cs_test_2"),
    }
    ids: dict[str, str] = {}
    for name, (email, headers, slot, checkout_id) in people.items():
        # A signed checkout callback matches by provider reference as well as
        # metadata. Give each booking its own reference, as Stripe does.
        stripe_env.checkout_id = checkout_id
        slots = await _slots(async_client, studio)
        proof = await get_proof(db_async, async_client, studio, slots[slot], email)
        response = await async_client.post(
            f"{API}/public/{studio.slug}/bookings",
            headers={**headers, "Idempotency-Key": uuid.uuid4().hex},
            json=_body(studio, slots[slot], customer_email=email, email_proof=proof),
        )
        assert response.status_code == 201, response.text
        receipt = response.json()
        assert (
            receipt["checkout_url"]
            == f"https://checkout.stripe.com/c/pay/{checkout_id}"
        )
        ids[name] = receipt["booking"]["id"]

    async def mine(name: str) -> list[dict]:
        resp = await async_client.get(f"{API}/me/bookings", headers=people[name][1])
        assert resp.status_code == 200, resp.text
        return resp.json()["data"]

    (due,) = await mine("ada")
    assert due["id"] == ids["ada"]
    assert due["payment"]["status"] == "due"
    assert due["payment"]["paid_minor"] == 0

    await _paid_by_stripe(db_async, async_client, ids["ada"], PRICE)
    (paid,) = await mine("ada")
    assert paid["payment"] == {
        "status": "paid",
        "amount_minor": PRICE,
        "paid_minor": PRICE,
        "refunded_minor": 0,
        "balance_at_salon_minor": 0,
        "currency": "XCD",
        "checkout_url": None,
    }
    # Bob's booking and payment never show up for Ada, and hers not for Bob.
    (bobs,) = await mine("bob")
    assert bobs["id"] == ids["bob"]
    assert bobs["payment"]["status"] == "due"
    assert ids["bob"] not in {row["id"] for row in await mine("ada")}

    cancelled = await async_client.post(
        f"{API}/org/bookings/{ids['ada']}/cancel",
        headers=studio.headers,
        json={"reason": "Studio closed"},
    )
    assert cancelled.status_code == 200, cancelled.text
    (refunded,) = await mine("ada")
    assert refunded["payment"]["status"] == "refunded"
    assert refunded["payment"]["refunded_minor"] == PRICE


async def test_the_ledger_labels_a_booking_charge_and_leaves_others_empty(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    stripe_env: payments_conftest.StripeStub,
    superuser_token_headers_async: dict[str, str],
) -> None:
    _ = stripe_env
    studio = await _full_price_studio(db_async, async_client)
    booking_id = (await _book_with_proof(db_async, async_client, studio)).json()[
        "booking"
    ]["id"]
    await _paid_by_stripe(db_async, async_client, booking_id, PRICE)
    intent = await async_client.post(
        f"{PAYMENTS}/org/intents",
        headers=studio.headers,
        json={
            "amount_minor": 1000,
            "currency": "XCD",
            "provider": "manual",
            "source_type": "custom.sale",
            "idempotency_key": uuid.uuid4().hex,
        },
    )
    assert intent.status_code == 201, intent.text
    paid = await async_client.post(
        f"{PAYMENTS}/org/intents/{intent.json()['intent']['id']}/manual-payments",
        headers=studio.headers,
        json={"method": "cash", "reference": "R-9"},
    )
    assert paid.status_code == 201, paid.text

    ledger = await async_client.get(
        f"{PAYMENTS}/admin/ledger?organisation_id={studio.org_id}&kind=charge",
        headers=superuser_token_headers_async,
    )
    by_type = {row["source_type"]: row for row in ledger.json()["data"]}
    booking_row = by_type["bookings.deposit"]
    assert booking_row["source_id"] == booking_id
    assert booking_row["description"]
    other = by_type["custom.sale"]
    assert other["source_id"] is None
    assert other["description"] is None


# --- pure helpers -------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("key", "expected"),
    [(None, False), ("", False), ("sk_live_x", False), ("sk_test_x", True)],
)
def test_only_a_stripe_test_key_turns_the_card_rail_on(
    monkeypatch: pytest.MonkeyPatch, key: str | None, expected: bool
) -> None:
    monkeypatch.setattr(deposit_payments.payments_settings, "STRIPE_SECRET_KEY", key)
    assert deposit_payments.stripe_available() is expected


def test_the_modes_are_the_documented_ones() -> None:
    assert [mode.value for mode in BookingPaymentMode] == ["deposit", "full_price"]
