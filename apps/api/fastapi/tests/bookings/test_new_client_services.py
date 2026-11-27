"""Services for new clients only (#1863). Every public booking of one is a request the
business confirms, whoever asks, so the answer never reveals a client's history. A
returning client (a confirmed or completed booking with the business, matched through
the contact rules, ADR-0058) is flagged for staff only. The lead time is information."""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.bookings.models import BookingStatus, Customer
from src.contacts.models import Contact
from tests.bookings.booking_day import MONDAY, utc_iso
from tests.bookings.email_code_helpers import book_known
from tests.bookings.test_public_bookings import (
    API,
    DAY,
    Studio,
    _booking_for,
    _emails,
    _slots,
    _studio,
)
from tests.factories import make_user

FLAG = "returning_client"


def _email() -> str:
    return f"new-{uuid.uuid4().hex[:8]}@example.com"


async def _patch(
    client: httpx.AsyncClient, studio: Studio, **fields: object
) -> httpx.Response:
    return await client.patch(
        f"{API}/org/services/{studio.service_id}", headers=studio.headers, json=fields
    )


async def _book_first_free(
    db: AsyncSession, client: httpx.AsyncClient, studio: Studio, email: str
) -> httpx.Response:
    slots = await _slots(client, studio)
    return await book_known(db, client, studio, slots[0], customer_email=email)


async def _flag_on(client: httpx.AsyncClient, studio: Studio, **extra: object) -> None:
    response = await _patch(client, studio, new_clients_only=True, **extra)
    assert response.status_code == 200, response.text


async def _studio_detail(
    client: httpx.AsyncClient, studio: Studio, receipt: dict
) -> dict:
    response = await client.get(
        f"{API}/org/bookings/{receipt['booking']['id']}", headers=studio.headers
    )
    assert response.status_code == 200, response.text
    return response.json()


async def _returning(
    db: AsyncSession,
    client: httpx.AsyncClient,
    studio: Studio,
    status: BookingStatus = BookingStatus.CONFIRMED,
) -> str:
    """An email with one earlier booking in ``status``, made before the flag is on."""
    email = _email()
    first = await _book_first_free(db, client, studio, email)
    assert first.status_code == 201, first.text
    booking = await _booking_for(db, first.json()["booking"]["id"])
    booking.status = status.value
    await db.commit()
    return email


# --- every client gets the same answer ------------------------------------------------


async def test_a_returning_and_a_new_client_get_identical_public_answers(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    old = await _returning(db_async, async_client, studio)
    await _flag_on(async_client, studio)

    new_email = _email()
    new = await _book_first_free(db_async, async_client, studio, new_email)
    returning = await _book_first_free(db_async, async_client, studio, old)
    assert new.status_code == returning.status_code == 201, returning.text
    assert new.json().keys() == returning.json().keys()
    assert new.json()["booking"].keys() == returning.json()["booking"].keys()
    assert new.json()["booking"]["status"] == "pending"
    assert returning.json()["booking"]["status"] == "pending"
    assert new.json()["payment_required"] is returning.json()["payment_required"]

    mails = {
        row.payload["to_email"]: row.payload
        for row in await _emails(db_async, studio.org_id)
    }
    # The returning client's first booking mailed too; compare the new request mails.
    sent = [
        row.payload
        for row in await _emails(db_async, studio.org_id)
        if row.dedupe_key.startswith("booking-confirmation:")
        and row.payload["to_email"] in (new_email, old)
        and row.dedupe_key.endswith(
            (new.json()["booking"]["id"], returning.json()["booking"]["id"])
        )
    ]
    assert len(sent) == 2, mails.keys()
    one, two = sent
    assert one["subject"] == two["subject"]
    assert one["props"]["chip"] == two["props"]["chip"]
    assert one["props"]["title"] == two["props"]["title"]

    # The calendar file the requester can download must not differ either: its
    # SEQUENCE counts the booking's history events.
    def sequence(ics: str) -> str:
        return next(line for line in ics.splitlines() if line.startswith("SEQUENCE"))

    new_ics = await async_client.get(
        f"{API}/public/bookings/{new.json()['manage_token']}/ics"
    )
    old_ics = await async_client.get(
        f"{API}/public/bookings/{returning.json()['manage_token']}/ics"
    )
    assert new_ics.status_code == old_ics.status_code == 200
    assert sequence(new_ics.text) == sequence(old_ics.text) == "SEQUENCE:0"


async def test_the_returning_client_is_flagged_for_staff_and_the_new_one_is_not(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    old = await _returning(db_async, async_client, studio)
    await _flag_on(async_client, studio)
    returning = (await _book_first_free(db_async, async_client, studio, old)).json()
    new = (await _book_first_free(db_async, async_client, studio, _email())).json()

    flagged = await _studio_detail(async_client, studio, returning)
    plain = await _studio_detail(async_client, studio, new)
    assert flagged[FLAG] is True
    assert plain[FLAG] is False
    # Same history for both: the event count drives the public ICS SEQUENCE.
    assert len(flagged["events"]) == len(plain["events"])

    agenda = await async_client.get(
        f"{API}/org/agenda",
        headers=studio.headers,
        params={"from_date": DAY, "to_date": DAY},
    )
    items = {
        item["id"]: item for day in agenda.json()["days"] for item in day["bookings"]
    }
    assert items[returning["booking"]["id"]][FLAG] is True
    assert items[new["booking"]["id"]][FLAG] is False


async def test_the_flag_never_reaches_a_public_surface(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=3)
    old = await _returning(db_async, async_client, studio)
    await _flag_on(async_client, studio)
    receipt = (await _book_first_free(db_async, async_client, studio, old)).json()

    manage = await async_client.get(f"{API}/public/bookings/{receipt['manage_token']}")
    storefront = await async_client.get(f"{API}/public/{studio.slug}")
    for text in (str(receipt), manage.text, storefront.text):
        assert "returning" not in text.lower()
    for row in await _emails(db_async, studio.org_id):
        assert "returning" not in str(row.payload).lower()


async def test_a_business_that_auto_confirms_still_holds_the_request(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(
        db_async, async_client, providers=2, requires_confirmation=False
    )
    open_service = await _book_first_free(db_async, async_client, studio, _email())
    assert open_service.json()["booking"]["status"] == "confirmed"
    await _flag_on(async_client, studio)
    held = await _book_first_free(db_async, async_client, studio, _email())
    assert held.status_code == 201, held.text
    assert held.json()["booking"]["status"] == "pending"


async def test_staff_bookings_are_confirmed_and_unflagged(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    from tests.bookings.test_studio_create import _create

    studio = await _studio(db_async, async_client, providers=2)
    old = await _returning(db_async, async_client, studio)
    await _flag_on(async_client, studio)
    response = await _create(
        async_client,
        studio,
        utc_iso(9, 30, day=MONDAY + timedelta(days=7)),
        customer_email=old,
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["status"] == "confirmed"
    detail = await async_client.get(
        f"{API}/org/bookings/{body['id']}", headers=studio.headers
    )
    assert detail.json()[FLAG] is False


# --- who counts as returning ----------------------------------------------------------


@pytest.mark.parametrize(
    ("status", "flagged"),
    [
        (BookingStatus.CONFIRMED, True),
        (BookingStatus.COMPLETED, True),
        (BookingStatus.PENDING, False),
        (BookingStatus.PENDING_PAYMENT, False),
        (BookingStatus.CANCELLED, False),
        (BookingStatus.NO_SHOW, False),
    ],
)
async def test_only_confirmed_and_completed_bookings_make_a_client_returning(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    status: BookingStatus,
    flagged: bool,
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    email = await _returning(db_async, async_client, studio, status)
    await _flag_on(async_client, studio)
    receipt = (
        await _book_first_free(db_async, async_client, studio, email.upper())
    ).json()
    assert (await _studio_detail(async_client, studio, receipt))[FLAG] is flagged


async def test_a_booking_at_another_business_does_not_count(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    other = await _studio(db_async, async_client)
    email = await _returning(db_async, async_client, other)
    studio = await _studio(db_async, async_client, providers=2)
    await _flag_on(async_client, studio)
    receipt = (await _book_first_free(db_async, async_client, studio, email)).json()
    assert (await _studio_detail(async_client, studio, receipt))[FLAG] is False


async def test_another_contact_linked_to_the_same_account_counts(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=4)
    confirmed_email = await _returning(db_async, async_client, studio)
    other_email = await _returning(
        db_async, async_client, studio, BookingStatus.CANCELLED
    )
    account = await make_user(db_async)
    await db_async.execute(
        update(Contact)
        .where(
            Contact.organisation_id == studio.org_id,
            Contact.email.in_([confirmed_email, other_email]),
        )
        .values(user_id=account.id)
    )
    await db_async.commit()
    await _flag_on(async_client, studio)
    receipt = (
        await _book_first_free(db_async, async_client, studio, other_email)
    ).json()
    assert (await _studio_detail(async_client, studio, receipt))[FLAG] is True
    # Nothing else was created for the booking beyond its own customer row.
    customers = await db_async.scalars(
        select(Customer).where(Customer.organisation_id == studio.org_id)
    )
    assert len(list(customers)) == 2


# --- the service settings -------------------------------------------------------------


async def test_a_new_clients_only_service_cannot_be_an_add_on(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    for flag in ("is_add_on", "also_add_on"):
        response = await _patch(
            async_client, studio, new_clients_only=True, **{flag: True}
        )
        assert response.status_code == 422, response.text
    created = await async_client.post(
        f"{API}/org/services",
        headers=studio.headers,
        json={
            "name": "Consultation",
            "duration_min": 30,
            "new_clients_only": True,
            "also_add_on": True,
        },
    )
    assert created.status_code == 422, created.text
    # A plain add-on cannot take the flag later either.
    plain = await async_client.post(
        f"{API}/org/services",
        headers=studio.headers,
        json={"name": "Wax", "duration_min": 30, "is_add_on": True},
    )
    assert plain.status_code == 201, plain.text
    flagged = await async_client.patch(
        f"{API}/org/services/{plain.json()['id']}",
        headers=studio.headers,
        json={"new_clients_only": True},
    )
    assert flagged.status_code == 422, flagged.text


@pytest.mark.parametrize(
    "field", ["new_clients_only", "is_add_on", "also_add_on", "active"]
)
async def test_an_explicit_null_flag_is_refused_not_a_500(
    db_async: AsyncSession, async_client: httpx.AsyncClient, field: str
) -> None:
    studio = await _studio(db_async, async_client)
    response = await _patch(async_client, studio, **{field: None})
    assert response.status_code == 422, response.text


async def test_the_flag_is_kept_when_a_patch_leaves_it_out(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    await _flag_on(
        async_client,
        studio,
        first_visit_lead_days=2,
        first_visit_categories=["Lashes", "Facials", "Lashes"],
    )
    other = await _patch(async_client, studio, description="Includes a patch test")
    assert other.status_code == 200, other.text
    body = other.json()
    assert body["new_clients_only"] is True
    assert body["first_visit_lead_days"] == 2
    assert body["first_visit_categories"] == ["Lashes", "Facials"]


async def test_the_lead_time_is_dropped_when_the_service_is_open_to_everyone(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    await _flag_on(
        async_client, studio, first_visit_lead_days=2, first_visit_categories=["Lashes"]
    )
    off = await _patch(async_client, studio, new_clients_only=False)
    assert off.status_code == 200, off.text
    body = off.json()
    assert body["new_clients_only"] is False
    assert body["first_visit_lead_days"] is None
    assert body["first_visit_categories"] is None


async def test_the_storefront_and_the_booking_expose_the_rule(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    await _flag_on(
        async_client, studio, first_visit_lead_days=2, first_visit_categories=["Lashes"]
    )
    page = await async_client.get(f"{API}/public/{studio.slug}")
    assert page.status_code == 200, page.text
    (svc,) = [s for s in page.json()["services"] if s["id"] == studio.service_id]
    assert svc["new_clients_only"] is True
    assert svc["first_visit_lead_days"] == 2
    assert svc["first_visit_categories"] == ["Lashes"]

    booked = await _book_first_free(db_async, async_client, studio, _email())
    assert booked.status_code == 201, booked.text
    detail = booked.json()["booking"]
    assert detail["new_clients_only"] is True
    assert detail["first_visit_lead_days"] == 2
    assert detail["first_visit_categories"] == ["Lashes"]


async def test_a_service_defaults_to_open_to_everyone(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    page = await async_client.get(f"{API}/public/{studio.slug}")
    (svc,) = [s for s in page.json()["services"] if s["id"] == studio.service_id]
    assert svc["new_clients_only"] is False
    assert svc["first_visit_lead_days"] is None


@pytest.mark.parametrize(
    "fields",
    [
        {"first_visit_lead_days": -1},
        {"first_visit_lead_days": 61},
        {"first_visit_categories": [""]},
        {"first_visit_categories": ["x" * 81]},
        {"first_visit_categories": [f"c{i}" for i in range(21)]},
    ],
)
async def test_values_out_of_bounds_are_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient, fields: dict
) -> None:
    studio = await _studio(db_async, async_client)
    response = await _patch(async_client, studio, new_clients_only=True, **fields)
    assert response.status_code == 422, response.text


async def test_the_bounds_themselves_are_accepted(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    for days in (0, 60):
        response = await _patch(
            async_client, studio, new_clients_only=True, first_visit_lead_days=days
        )
        assert response.status_code == 200, response.text
        assert response.json()["first_visit_lead_days"] == days
