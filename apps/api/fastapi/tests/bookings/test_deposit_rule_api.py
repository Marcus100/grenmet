"""The business-wide deposit rule through the API: the settings, the deposit at
booking, the entitlement gate, the storefront, the mail and manage page wording.

Price in these tests is 21000 minor (XCD 210.00), from the shared studio helper."""

import json
import uuid

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import deposit_payments
from src.bookings.models import Service
from src.organisations.models import MembershipRole
from tests.bookings.email_code_helpers import get_proof
from tests.bookings.test_deposits import _drain, _intent, _pay_manually
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _emails,
    _slots,
    _studio,
)
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

PRICE = 21000


async def _ruled(
    db: AsyncSession,
    client: httpx.AsyncClient,
    *,
    apps: tuple[str, ...] = ("bookings", "payments"),
    **rule: object,
) -> Studio:
    """A studio whose profile carries the deposit rule and whose service has no
    deposit of its own (the helper's service does not set one)."""
    return await _studio(db, client, apps=apps, **rule)


async def _book_with_proof(
    db: AsyncSession, client: httpx.AsyncClient, studio: Studio, slot: int = 0
) -> httpx.Response:
    slots = await _slots(client, studio)
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    proof = await get_proof(db, client, studio, slots[slot], email)
    return await _book(
        client, studio, slots[slot], customer_email=email, email_proof=proof
    )


async def _settings(client: httpx.AsyncClient, studio: Studio) -> dict:
    response = await client.get(f"{API}/org/profile", headers=studio.headers)
    assert response.status_code == 200, response.text
    return response.json()


async def _put_rule(
    client: httpx.AsyncClient, studio: Studio, **rule: object
) -> httpx.Response:
    profile = await _settings(client, studio)
    body = {
        key: value
        for key, value in profile.items()
        if key not in {"id", "organisation_id", "created_at", "updated_at"}
    }
    body.update(rule)
    return await client.put(f"{API}/org/profile", headers=studio.headers, json=body)


# --- the settings ----------------------------------------------------------------------


async def test_the_rule_defaults_to_none_for_every_profile(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    profile = await _settings(async_client, studio)
    assert profile["deposit_mode"] == "none"
    assert profile["deposit_percent"] is None
    assert profile["deposit_fixed_minor"] is None


@pytest.mark.parametrize(
    "rule",
    [
        {"deposit_mode": "percent"},
        {"deposit_mode": "percent", "deposit_percent": 0},
        {"deposit_mode": "percent", "deposit_percent": 101},
        {"deposit_mode": "fixed"},
        {"deposit_mode": "fixed", "deposit_fixed_minor": 0},
        {"deposit_mode": "half"},
    ],
)
async def test_an_incomplete_or_unknown_rule_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient, rule: dict
) -> None:
    studio = await _studio(db_async, async_client)
    response = await _put_rule(async_client, studio, **rule)
    assert response.status_code == 422, response.text


async def test_omitted_rule_fields_keep_the_stored_rule(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    saved = await _put_rule(
        async_client, studio, deposit_mode="percent", deposit_percent=20
    )
    assert saved.status_code == 200, saved.text

    # An older client that sends none of the rule fields keeps it.
    body = {
        "public_slug": studio.slug,
        "display_name": "Babydoll Beauty Bar",
        "enabled": True,
    }
    kept = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=body
    )
    assert kept.status_code == 200, kept.text
    assert kept.json()["deposit_mode"] == "percent"
    assert kept.json()["deposit_percent"] == 20


async def test_clearing_the_percentage_of_a_percent_rule_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    await _put_rule(async_client, studio, deposit_mode="percent", deposit_percent=20)
    # The mode is kept from storage, so a null percentage would leave an invalid rule.
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={
            "public_slug": studio.slug,
            "display_name": "Babydoll Beauty Bar",
            "enabled": True,
            "deposit_percent": None,
        },
    )
    assert response.status_code == 422, response.text


# --- the deposit at booking -------------------------------------------------------------


async def test_a_percent_rule_charges_its_share_and_counts_toward_the_price(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _ruled(
        db_async, async_client, deposit_mode="percent", deposit_percent=50
    )
    response = await _book_with_proof(db_async, async_client, studio)
    assert response.status_code == 201, response.text
    booking = response.json()["booking"]
    assert booking["status"] == "pending_payment"
    assert booking["price_minor"] == PRICE
    assert booking["deposit_minor"] == 10500
    assert booking["payment"]["amount_minor"] == 10500


async def test_a_fixed_rule_charges_the_amount_per_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _ruled(
        db_async, async_client, deposit_mode="fixed", deposit_fixed_minor=5000
    )
    response = await _book_with_proof(db_async, async_client, studio)
    assert response.status_code == 201, response.text
    assert response.json()["booking"]["deposit_minor"] == 5000


async def test_a_fixed_rule_above_the_price_is_capped_at_the_price(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _ruled(
        db_async, async_client, deposit_mode="fixed", deposit_fixed_minor=90000
    )
    response = await _book_with_proof(db_async, async_client, studio)
    assert response.status_code == 201, response.text
    assert response.json()["booking"]["deposit_minor"] == PRICE


async def test_a_service_deposit_overrides_the_business_rule(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _ruled(
        db_async, async_client, deposit_mode="percent", deposit_percent=50
    )
    service = await db_async.get(Service, uuid.UUID(studio.service_id))
    assert service is not None
    service.deposit_minor = 4000
    await db_async.commit()
    response = await _book_with_proof(db_async, async_client, studio)
    assert response.status_code == 201, response.text
    assert response.json()["booking"]["deposit_minor"] == 4000


async def test_no_payments_entitlement_books_without_a_deposit(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio = await _ruled(
        db_async,
        async_client,
        apps=("bookings",),
        deposit_mode="percent",
        deposit_percent=50,
    )
    starts_at = (await _slots(async_client, studio))[0]
    skipped: list[str] = []
    monkeypatch.setattr(
        deposit_payments.logger,
        "info",
        lambda message, *args, **kwargs: skipped.append(message),
    )
    response = await _book(async_client, studio, starts_at)
    assert response.status_code == 201, response.text
    booking = response.json()["booking"]
    assert booking["status"] == "confirmed"
    assert booking["deposit_minor"] == 0
    assert (
        "booking deposit skipped: organisation has no payments entitlement" in skipped
    )


async def test_the_storefront_shows_the_rule_due_per_service(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _ruled(
        db_async, async_client, deposit_mode="percent", deposit_percent=50
    )
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    assert storefront.status_code == 200, storefront.text
    due = {s["id"]: s["due_at_booking_minor"] for s in storefront.json()["services"]}
    assert due[studio.service_id] == 10500

    unentitled = await _ruled(
        db_async,
        async_client,
        apps=("bookings",),
        deposit_mode="percent",
        deposit_percent=50,
    )
    plain = await async_client.get(f"{API}/public/{unentitled.slug}")
    due = {s["id"]: s["due_at_booking_minor"] for s in plain.json()["services"]}
    assert due[unentitled.service_id] == 0


# --- default off: an existing business is unchanged --------------------------------------


async def test_default_off_regression_charges_nothing_without_a_service_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """Regression: a business that never set the rule books a priced service with
    no deposit, as before this change, and keeps its per-service deposit."""
    studio = await _studio(db_async, async_client, apps=("bookings", "payments"))
    starts_at = (await _slots(async_client, studio))[0]
    response = await _book(async_client, studio, starts_at)
    assert response.status_code == 201, response.text
    booking = response.json()["booking"]
    assert booking["status"] == "confirmed"
    assert booking["deposit_minor"] == 0
    assert booking["payment"] is None
    assert await _intent(db_async, booking["id"]) is None


async def test_default_off_keeps_a_service_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, apps=("bookings", "payments"))
    service = await db_async.get(Service, uuid.UUID(studio.service_id))
    assert service is not None
    service.deposit_minor = 5000
    await db_async.commit()
    response = await _book_with_proof(db_async, async_client, studio)
    assert response.status_code == 201, response.text
    assert response.json()["booking"]["deposit_minor"] == 5000


# --- what the customer sees: the mail, the manage page and the studio ----------------------


async def test_a_paid_deposit_states_the_balance_at_the_salon(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _ruled(
        db_async, async_client, deposit_mode="percent", deposit_percent=50
    )
    receipt = (await _book_with_proof(db_async, async_client, studio)).json()
    booking_id = receipt["booking"]["id"]
    intent = await _intent(db_async, booking_id)
    assert intent is not None
    await _pay_manually(async_client, studio, intent.id)
    await _drain(db_async)

    line = "Deposit paid XCD 105.00, remaining XCD 105.00 at the salon."
    mails = await _emails(db_async, studio.org_id)
    confirmation = [
        m for m in mails if m.dedupe_key.startswith("booking-confirmation:")
    ]
    assert confirmation, "the paid deposit queues the customer confirmation"
    assert line in json.dumps(confirmation[0].payload)

    manage = await async_client.get(f"{API}/public/bookings/{receipt['manage_token']}")
    assert manage.status_code == 200, manage.text
    assert manage.json()["payment"]["balance_at_salon_minor"] == 10500

    detail = await async_client.get(
        f"{API}/org/bookings/{booking_id}", headers=studio.headers
    )
    assert detail.status_code == 200, detail.text
    assert detail.json()["balance_at_salon_minor"] == 10500


async def test_a_mail_without_a_paid_deposit_has_no_payment_line(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    response = await _book(
        async_client, studio, (await _slots(async_client, studio))[0]
    )
    assert response.status_code == 201, response.text
    mails = await _emails(db_async, studio.org_id)
    assert mails
    assert all("at the salon" not in json.dumps(m.payload) for m in mails)


# --- isolation between businesses --------------------------------------------------------


async def test_one_business_rule_is_never_read_by_another(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    ours = await _ruled(
        db_async, async_client, deposit_mode="percent", deposit_percent=50
    )
    theirs = await _studio(db_async, async_client, apps=("bookings", "payments"))
    assert (await _settings(async_client, theirs))["deposit_mode"] == "none"
    assert (await _settings(async_client, ours))["deposit_mode"] == "percent"

    # A foreign service id is a 404 on the studio's settings routes.
    other = await make_user(db_async)
    org = await make_org(
        db_async,
        f"Salon {uuid.uuid4().hex[:6]}",
        members=((other, MembershipRole.OWNER),),
        apps=("bookings",),
    )
    foreign = await async_client.put(
        f"{API}/org/services/order",
        headers=headers_for(other, org.id),
        json={"ids": [theirs.service_id]},
    )
    assert foreign.status_code == 404, foreign.text


async def test_a_full_prepayment_says_paid_in_full(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """A deposit equal to the price is a full prepayment: no balance is stated."""
    studio = await _ruled(
        db_async, async_client, deposit_mode="percent", deposit_percent=100
    )
    receipt = (await _book_with_proof(db_async, async_client, studio)).json()
    assert receipt["booking"]["deposit_minor"] == PRICE
    intent = await _intent(db_async, receipt["booking"]["id"])
    assert intent is not None
    await _pay_manually(async_client, studio, intent.id)
    await _drain(db_async)

    mails = await _emails(db_async, studio.org_id)
    confirmation = [
        m for m in mails if m.dedupe_key.startswith("booking-confirmation:")
    ]
    assert "Paid in full, XCD 210.00." in json.dumps(confirmation[0].payload)
    assert "at the salon" not in json.dumps(confirmation[0].payload)


async def test_full_price_without_stripe_keeps_the_business_rule_deposit(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    """Without a Stripe test key, ``full_price`` acts as ``deposit``: the business
    rule's deposit still applies on the deposit path, not the full price."""
    assert not deposit_payments.stripe_available()
    studio = await _ruled(
        db_async,
        async_client,
        payment_at_booking="full_price",
        deposit_mode="percent",
        deposit_percent=50,
    )
    response = await _book_with_proof(db_async, async_client, studio)
    assert response.status_code == 201, response.text
    booking = response.json()["booking"]
    assert booking["status"] == "pending_payment"
    assert booking["deposit_minor"] == 10500
    assert booking["price_minor"] == PRICE
