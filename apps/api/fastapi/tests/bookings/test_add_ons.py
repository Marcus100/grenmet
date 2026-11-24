"""Bookings add-ons: the switch, combined length and price, validation, moves,
mail and ICS content, and the studio views. The rules are pure; the rest runs
against the real database through the public and studio routes."""

import uuid
from datetime import datetime

import httpx
import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings import add_ons, deposit_payments
from src.bookings.models import BookingPaymentMode
from tests.bookings.booking_day import DAY
from tests.bookings.email_code_helpers import get_proof
from tests.bookings.test_public_bookings import (
    API,
    Studio,
    _book,
    _booking_for,
    _emails,
    _slots,
    _studio,
)
from tests.email_payload import payload_html

PRICE = 21000
ADD_ON_PRICE = 3000
MAIN_MINUTES = 120
ADD_ON_MINUTES = 30


# --- pure rules ------------------------------------------------------------------------


def test_no_restriction_offers_an_add_on_with_any_main_service() -> None:
    assert add_ons.offered_with(None, None)
    assert add_ons.offered_with([], "Facials")


def test_a_restriction_offers_only_the_listed_main_categories() -> None:
    assert add_ons.offered_with(["Lashes"], "Lashes")
    assert not add_ons.offered_with(["Lashes"], "Facials")
    assert not add_ons.offered_with(["Lashes"], None)


def test_categories_are_trimmed_de_duplicated_and_blank_means_none() -> None:
    assert add_ons.normalised_categories([" Lashes ", "Lashes", "  ", "Facials"]) == [
        "Lashes",
        "Facials",
    ]
    assert add_ons.normalised_categories(["  "]) is None
    assert add_ons.normalised_categories(None) is None


class _Svc:
    """Only the fields the price rules read."""

    def __init__(self, price_minor: int, deposit_minor: int = 0) -> None:
        self.price_minor = price_minor
        self.deposit_minor = deposit_minor


def test_a_percent_rule_applies_to_the_combined_price() -> None:
    rule = deposit_payments.DepositRule(mode="percent", percent=50)
    svc = _Svc(PRICE)
    assert deposit_payments.planned_deposit(svc, rule) == 10500
    assert deposit_payments.planned_deposit(svc, rule, PRICE + ADD_ON_PRICE) == 12000


def test_a_service_deposit_wins_over_the_rule_with_add_ons() -> None:
    rule = deposit_payments.DepositRule(mode="percent", percent=50)
    svc = _Svc(PRICE, deposit_minor=5000)
    assert deposit_payments.planned_deposit(svc, rule, PRICE + ADD_ON_PRICE) == 5000


def test_full_price_charges_the_combined_price_only_when_entitled() -> None:
    rule = deposit_payments.DepositRule()
    svc = _Svc(PRICE)
    combined = PRICE + ADD_ON_PRICE
    assert (
        deposit_payments.due_for(
            svc, full_price=True, entitled=True, rule=rule, price_minor=combined
        )
        == combined
    )
    assert (
        deposit_payments.due_for(
            svc, full_price=True, entitled=False, rule=rule, price_minor=combined
        )
        == 0
    )


# --- helpers ---------------------------------------------------------------------------


async def _service(client: httpx.AsyncClient, studio: Studio, **body: object) -> str:
    """Create a service in ``studio``; returns its id."""
    response = await client.post(
        f"{API}/org/services", headers=studio.headers, json=body
    )
    assert response.status_code == 201, response.text
    return str(response.json()["id"])


async def _addon(client: httpx.AsyncClient, studio: Studio, **overrides: object) -> str:
    body: dict[str, object] = {
        "name": "Brow wax",
        "duration_min": ADD_ON_MINUTES,
        "price_minor": ADD_ON_PRICE,
        "is_add_on": True,
    }
    body.update(overrides)
    return await _service(client, studio, **body)


async def _slots_with(
    client: httpx.AsyncClient, studio: Studio, add_on_ids: list[str]
) -> list[dict[str, str]]:
    response = await client.get(
        f"{API}/public/{studio.slug}/availability",
        params={
            "service_id": studio.service_id,
            "first_day": DAY,
            "last_day": DAY,
            "add_on_ids": add_on_ids,
        },
    )
    assert response.status_code == 200, response.text
    return list(response.json()["slots"])


def _minutes(start: str, end: str) -> int:
    a = datetime.fromisoformat(start.replace("Z", "+00:00"))
    b = datetime.fromisoformat(end.replace("Z", "+00:00"))
    return int((b - a).total_seconds() // 60)


# --- the switch ------------------------------------------------------------------------


async def test_switch_off_changes_nothing_for_the_business(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    addon = await _addon(async_client, studio)
    store = (await async_client.get(f"{API}/public/{studio.slug}")).json()
    assert store["add_ons"] == []
    assert [s["id"] for s in store["services"]] == [studio.service_id]
    # Add-ons are never bookable alone, even when the switch is off.
    slots = await _slots(async_client, studio)
    response = await async_client.get(
        f"{API}/public/{studio.slug}/availability",
        params={
            "service_id": addon,
            "first_day": DAY,
            "last_day": DAY,
        },
    )
    assert response.status_code == 404
    refused = await _book(async_client, studio, slots[0], add_on_ids=[addon])
    assert refused.status_code == 422
    booked = await _book(async_client, studio, slots[0])
    assert booked.status_code == 201, booked.text
    assert booked.json()["booking"]["price_minor"] == PRICE
    assert booked.json()["booking"]["add_ons"] == []


async def test_an_add_on_cannot_be_the_main_service(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    addon = await _addon(async_client, studio)
    slots = await _slots(async_client, studio)
    response = await _book(async_client, studio, slots[0], service_id=addon)
    assert response.status_code == 404


# --- the storefront --------------------------------------------------------------------


async def test_storefront_lists_each_add_on_with_the_services_it_follows(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    lashes = await _service(
        async_client,
        studio,
        name="Lash lift",
        category="Lashes",
        duration_min=45,
        price_minor=5000,
    )
    anything = await _addon(async_client, studio, name="Chin wax", price_minor=1500)
    lash_only = await _addon(
        async_client,
        studio,
        name="Lash tint",
        duration_min=15,
        price_minor=2000,
        add_on_categories=["Lashes"],
    )
    store = (await async_client.get(f"{API}/public/{studio.slug}")).json()
    by_name = {item["name"]: item for item in store["add_ons"]}
    assert set(by_name) == {"Chin wax", "Lash tint"}
    assert by_name["Chin wax"]["id"] == anything
    assert set(by_name["Chin wax"]["service_ids"]) == {studio.service_id, lashes}
    assert by_name["Lash tint"]["id"] == lash_only
    assert by_name["Lash tint"]["service_ids"] == [lashes]
    # Add-ons leave the main list.
    assert anything not in {s["id"] for s in store["services"]}
    assert lash_only not in {s["id"] for s in store["services"]}


# --- combined length and price -------------------------------------------------------


async def test_the_combined_length_drives_availability(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    addon = await _addon(async_client, studio)
    plain = await _slots_with(async_client, studio, [])
    combined = await _slots_with(async_client, studio, [addon])
    assert plain and combined
    assert _minutes(plain[0]["starts_at"], plain[0]["ends_at"]) == MAIN_MINUTES
    assert _minutes(combined[0]["starts_at"], combined[0]["ends_at"]) == (
        MAIN_MINUTES + ADD_ON_MINUTES
    )
    # 10:00 local no longer fits the morning window with the add-on (ends 12:30 + buffer).
    assert len(combined) < len(plain)


async def test_a_booking_with_an_add_on_is_timed_and_priced_on_the_server(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    addon = await _addon(async_client, studio)
    slot = (await _slots_with(async_client, studio, [addon]))[0]
    response = await _book(async_client, studio, slot["starts_at"], add_on_ids=[addon])
    assert response.status_code == 201, response.text
    booking = response.json()["booking"]
    assert booking["price_minor"] == PRICE + ADD_ON_PRICE
    assert _minutes(booking["starts_at"], booking["ends_at"]) == (
        MAIN_MINUTES + ADD_ON_MINUTES
    )
    assert booking["add_ons"] == [
        {
            "name": "Brow wax",
            "duration_min": ADD_ON_MINUTES,
            "price_minor": ADD_ON_PRICE,
        }
    ]


async def test_the_deposit_rule_uses_the_combined_price(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async,
        async_client,
        apps=("bookings", "payments"),
        add_ons_enabled=True,
        deposit_mode="percent",
        deposit_percent=50,
    )
    addon = await _addon(async_client, studio)
    slot = (await _slots_with(async_client, studio, [addon]))[0]
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    proof = await get_proof(db_async, async_client, studio, slot["starts_at"], email)
    response = await _book(
        async_client,
        studio,
        slot["starts_at"],
        add_on_ids=[addon],
        customer_email=email,
        email_proof=proof,
    )
    assert response.status_code == 201, response.text
    booking = response.json()["booking"]
    assert booking["status"] == "pending_payment"
    assert booking["price_minor"] == PRICE + ADD_ON_PRICE
    assert booking["deposit_minor"] == 12000


async def test_full_price_mode_charges_the_combined_price(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Full-price payment needs the card rail, so the test switches it on."""
    monkeypatch.setattr(deposit_payments, "stripe_available", lambda: True)
    studio = await _studio(
        db_async,
        async_client,
        apps=("bookings", "payments"),
        add_ons_enabled=True,
        payment_at_booking=BookingPaymentMode.FULL_PRICE.value,
    )
    addon = await _addon(async_client, studio)
    slot = (await _slots_with(async_client, studio, [addon]))[0]
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    proof = await get_proof(db_async, async_client, studio, slot["starts_at"], email)
    response = await _book(
        async_client,
        studio,
        slot["starts_at"],
        add_on_ids=[addon],
        customer_email=email,
        email_proof=proof,
    )
    assert response.status_code == 201, response.text
    assert response.json()["booking"]["deposit_minor"] == PRICE + ADD_ON_PRICE


# --- validation ------------------------------------------------------------------------


async def test_add_ons_are_validated_on_the_server(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    other = await _studio(db_async, async_client, add_ons_enabled=True)
    foreign = await _service(
        async_client,
        other,
        name="Other wax",
        duration_min=10,
        price_minor=100,
        is_add_on=True,
    )
    inactive = await _addon(async_client, studio, name="Old wax", active=False)
    restricted = await _addon(
        async_client, studio, name="Lash-only tint", add_on_categories=["Lashes"]
    )
    addon = await _addon(async_client, studio)
    main = studio.service_id
    slot = (await _slots(async_client, studio))[0]
    cases = [
        ([foreign], "foreign"),
        ([inactive], "inactive"),
        ([restricted], "restricted"),
        ([addon, addon], "duplicate"),
        ([main], "main service as an add-on"),
        ([str(uuid.uuid4())], "unknown"),
        ([addon] * 6, "over the limit"),
    ]
    for ids, label in cases:
        response = await _book(async_client, studio, slot, add_on_ids=ids)
        assert response.status_code == 422, f"{label}: {response.text}"
    # The refused requests held nothing: the slot is still open for the add-on.
    assert await _slots_with(async_client, studio, [addon])


# --- reschedule ------------------------------------------------------------------------


async def test_reschedule_keeps_the_add_ons_and_rechecks_the_combined_length(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    addon = await _addon(async_client, studio)
    slots = await _slots_with(async_client, studio, [addon])
    created = await _book(
        async_client, studio, slots[0]["starts_at"], add_on_ids=[addon]
    )
    assert created.status_code == 201, created.text
    token = created.json()["manage_token"]
    target = slots[-1]["starts_at"]
    moved = await async_client.post(
        f"{API}/public/bookings/{token}/reschedule", json={"starts_at": target}
    )
    assert moved.status_code == 200, moved.text
    body = moved.json()
    assert body["starts_at"] == target
    assert _minutes(body["starts_at"], body["ends_at"]) == (
        MAIN_MINUTES + ADD_ON_MINUTES
    )
    assert [line["name"] for line in body["add_ons"]] == ["Brow wax"]
    assert body["price_minor"] == PRICE + ADD_ON_PRICE


# --- mail, ICS and the studio ----------------------------------------------------------


async def test_mail_and_ics_show_the_add_ons(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    addon = await _addon(async_client, studio)
    slot = (await _slots_with(async_client, studio, [addon]))[0]
    created = await _book(async_client, studio, slot["starts_at"], add_on_ids=[addon])
    assert created.status_code == 201, created.text
    token = created.json()["manage_token"]
    mails = await _emails(db_async, studio.org_id)
    assert mails
    html = payload_html(mails[0].payload)
    assert "Add-ons" in html and "Brow wax" in html
    ics = await async_client.get(f"{API}/public/bookings/{token}/ics")
    assert ics.status_code == 200, ics.text
    assert "Add-ons: Brow wax." in ics.text


async def test_studio_detail_and_agenda_show_the_add_ons(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    addon = await _addon(async_client, studio)
    slot = (await _slots_with(async_client, studio, [addon]))[0]
    created = await _book(async_client, studio, slot["starts_at"], add_on_ids=[addon])
    booking_id = created.json()["booking"]["id"]
    detail = await async_client.get(
        f"{API}/org/bookings/{booking_id}", headers=studio.headers
    )
    assert detail.status_code == 200, detail.text
    assert [line["name"] for line in detail.json()["add_ons"]] == ["Brow wax"]
    booking = await _booking_for(db_async, booking_id)
    day = booking.starts_at.date().isoformat()
    agenda = await async_client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={"from_date": day, "to_date": day},
    )
    assert agenda.status_code == 200, agenda.text
    items = [item for entry in agenda.json()["days"] for item in entry["bookings"]]
    assert [item["add_on_names"] for item in items if item["id"] == booking_id] == [
        ["Brow wax"]
    ]


async def test_a_service_form_keeps_categories_for_add_ons_only(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    main = await _service(
        async_client,
        studio,
        name="Facial",
        duration_min=60,
        price_minor=9000,
        add_on_categories=["Lashes"],
    )
    stored = await async_client.get(f"{API}/org/settings", headers=studio.headers)
    service = next(s for s in stored.json()["services"] if s["id"] == main)
    assert service["is_add_on"] is False
    assert service["add_on_categories"] is None
    addon = await _addon(
        async_client, studio, add_on_categories=[" Facials ", "Facials"]
    )
    stored = await async_client.get(f"{API}/org/settings", headers=studio.headers)
    service = next(s for s in stored.json()["services"] if s["id"] == addon)
    assert service["is_add_on"] is True
    assert service["add_on_categories"] == ["Facials"]


async def test_the_switch_is_kept_unless_named(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, add_ons_enabled=True)
    profile = (
        await async_client.get(f"{API}/org/profile", headers=studio.headers)
    ).json()
    body = {
        key: value
        for key, value in profile.items()
        if key not in {"id", "organisation_id", "created_at", "updated_at"}
    }
    body.pop("add_ons_enabled")
    response = await async_client.put(
        f"{API}/org/profile", headers=studio.headers, json=body
    )
    assert response.status_code == 200, response.text
    assert response.json()["add_ons_enabled"] is True
