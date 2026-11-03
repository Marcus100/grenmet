"""Bookings B3: public create, manage, cancel, reschedule, ICS, emails, reminders."""

import asyncio
import hashlib
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

import httpx
import pytest
from sqlalchemy import func, select
from sqlalchemy.exc import DBAPIError
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox, turnstile
from src.bookings import public, reminders
from src.bookings.models import Booking, BookingEvent, BookingStatus, Customer
from src.contacts.models import Contact
from src.email_config import email_settings
from src.idempotency import IdempotencyKey
from src.notifications import outbox_handlers
from src.notifications.models import OutboundEmail
from src.organisations import service as organisation_service
from src.organisations.models import MembershipRole, PublicSite, new_public_site_id
from src.outbox import Outbox
from src.utils.datetime import utc_now
from tests.bookings.booking_day import DAY, MONDAY, utc_iso
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/bookings"
MANAGE = "https://babydoll.example/manage/{token}"


@dataclass
class Studio:
    org_id: str
    slug: str
    service_id: str
    provider_ids: list[str]
    headers: dict[str, str]


async def _studio(
    db: AsyncSession,
    client: httpx.AsyncClient,
    *,
    providers: int = 1,
    apps: tuple[str, ...] = ("bookings",),
    **profile: object,
) -> Studio:
    owner = await make_user(db)
    org = await make_org(
        db,
        f"Salon {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER),),
        apps=apps,
    )
    headers = headers_for(owner, org.id)
    slug = f"salon-{uuid.uuid4().hex[:10]}"
    body = {
        "public_slug": slug,
        "display_name": "Babydoll Beauty Bar",
        "enabled": True,
        "lead_time_min": 0,
        "horizon_days": 365,
        "cancel_cutoff_hours": 24,
        "notify_email": "studio@example.com",
        "manage_url_template": MANAGE,
        **profile,
    }
    # The profile route needs the entitlement, so grant it before and revoke after.
    await organisation_service.set_app_enabled(
        db, organisation_id=org.id, app_key="bookings", enabled=True
    )
    await db.commit()
    assert (
        await client.put(f"{API}/org/profile", headers=headers, json=body)
    ).status_code == 200
    created = await client.post(
        f"{API}/org/services",
        headers=headers,
        json={
            "name": "Classic full set",
            "duration_min": 120,
            "buffer_after_min": 15,
            "price_minor": 21000,
        },
    )
    service_id = created.json()["id"]
    provider_ids = []
    for n in range(providers):
        provider = await client.post(
            f"{API}/org/providers",
            headers=headers,
            json={"name": f"Provider {n}", "service_ids": [service_id]},
        )
        provider_id = provider.json()["id"]
        provider_ids.append(provider_id)
        hours = await client.put(
            f"{API}/org/providers/{provider_id}/hours",
            headers=headers,
            json={
                "periods": [
                    {"weekday": 0, "start_time": "09:30", "end_time": "12:30"},
                    {"weekday": 0, "start_time": "13:30", "end_time": "17:30"},
                ]
            },
        )
        assert hours.status_code == 200
    if "bookings" not in apps:
        await organisation_service.set_app_enabled(
            db, organisation_id=org.id, app_key="bookings", enabled=False
        )
        await db.commit()
    return Studio(org.id, slug, service_id, provider_ids, headers)


async def _slots(client: httpx.AsyncClient, studio: Studio) -> list[str]:
    response = await client.get(
        f"{API}/public/{studio.slug}/availability",
        params={
            "service_id": studio.service_id,
            "first_day": DAY,
            "last_day": DAY,
        },
    )
    assert response.status_code == 200, response.text
    return [slot["starts_at"] for slot in response.json()["slots"]]


def _body(studio: Studio, starts_at: str, **overrides: object) -> dict[str, object]:
    body: dict[str, object] = {
        "service_id": studio.service_id,
        "starts_at": starts_at,
        "customer_name": "Ada Lovelace",
        "customer_email": f"ada-{uuid.uuid4().hex[:8]}@example.com",
        "customer_phone": "+1 473 555 0100",
    }
    body.update(overrides)
    return body


async def _book(
    client: httpx.AsyncClient,
    studio: Studio,
    starts_at: str,
    *,
    key: str | None = None,
    **overrides: object,
) -> httpx.Response:
    return await client.post(
        f"{API}/public/{studio.slug}/bookings",
        headers={"Idempotency-Key": key or uuid.uuid4().hex},
        json=_body(studio, starts_at, **overrides),
    )


async def _booking_for(db: AsyncSession, booking_id: str) -> Booking:
    db.expire_all()
    booking = await db.get(Booking, uuid.UUID(booking_id))
    assert booking is not None
    return booking


async def _emails(db: AsyncSession, org_id: str) -> list[Outbox]:
    return list(
        await db.scalars(
            select(Outbox)
            .where(
                Outbox.organisation_id == org_id,
                Outbox.topic == outbox_handlers.EMAIL_SEND,
            )
            .order_by(Outbox.dedupe_key)
            .execution_options(populate_existing=True)
        )
    )


# --- create ---------------------------------------------------------------------------


async def test_create_confirms_and_never_stores_the_token(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    response = await _book(async_client, studio, starts_at)
    assert response.status_code == 201, response.text
    receipt = response.json()
    token = receipt["manage_token"]
    assert len(token) >= 40
    assert receipt["manage_url"] == MANAGE.replace("{token}", token)
    assert receipt["booking"]["status"] == "confirmed"
    assert receipt["booking"]["can_cancel"] is True
    assert receipt["booking"]["starts_at"] == starts_at

    booking = await _booking_for(db_async, receipt["booking"]["id"])
    assert booking.manage_token_hash == hashlib.sha256(token.encode()).hexdigest()
    assert booking.blocked_until - booking.ends_at == timedelta(minutes=15)
    assert booking.price_minor == 21000
    # The token appears in no booking-side column or history row.
    customer = await db_async.get(Customer, booking.customer_id)
    events = list(
        await db_async.scalars(
            select(BookingEvent).where(BookingEvent.booking_id == booking.id)
        )
    )
    assert [(e.from_status, e.to_status) for e in events] == [(None, "confirmed")]
    haystack = (
        repr(vars(booking)) + repr(vars(customer)) + repr([vars(e) for e in events])
    )
    assert token not in haystack
    assert customer is not None
    contact = await db_async.get(Contact, customer.contact_id)
    assert contact is not None
    assert contact.email_hash and contact.email_hash != contact.email
    # The customer keeps no personal data of its own (ADR-0028).
    assert not {"name", "email", "email_hash", "phone", "marketing_consent"} & set(
        vars(customer)
    )


async def test_requires_confirmation_creates_a_pending_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, requires_confirmation=True)
    receipt = (
        await _book(async_client, studio, (await _slots(async_client, studio))[0])
    ).json()
    assert receipt["booking"]["status"] == "pending"


async def test_repeat_customer_reuses_the_customer_row(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    email = f"repeat-{uuid.uuid4().hex[:6]}@example.com"
    first = (await _book(async_client, studio, slots[0], customer_email=email)).json()
    second = (
        await _book(async_client, studio, slots[-1], customer_email=email.upper())
    ).json()
    first_customer = (await _booking_for(db_async, first["booking"]["id"])).customer_id
    second_customer = (
        await _booking_for(db_async, second["booking"]["id"])
    ).customer_id
    assert first_customer == second_customer


async def test_replay_returns_the_first_answer_without_a_second_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    body = _body(studio, starts_at)
    headers = {"Idempotency-Key": "replay-key-1"}
    url = f"{API}/public/{studio.slug}/bookings"
    first = await async_client.post(url, headers=headers, json=body)
    again = await async_client.post(url, headers=headers, json=body)
    assert first.status_code == again.status_code == 201
    assert again.json() == first.json()
    assert again.headers["Idempotency-Replayed"] == "true"
    assert "Idempotency-Replayed" not in first.headers
    count = await db_async.scalar(
        select(func.count())
        .select_from(Booking)
        .where(Booking.organisation_id == studio.org_id)
    )
    assert count == 1
    assert len(await _emails(db_async, studio.org_id)) == 2


async def test_same_key_with_a_different_body_is_409(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    url = f"{API}/public/{studio.slug}/bookings"
    headers = {"Idempotency-Key": "reuse-key"}
    assert (
        await async_client.post(url, headers=headers, json=_body(studio, slots[0]))
    ).status_code == 201
    other = await async_client.post(url, headers=headers, json=_body(studio, slots[1]))
    assert other.status_code == 409
    assert "different request" in other.json()["detail"]


async def test_idempotency_key_is_required(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    response = await async_client.post(
        f"{API}/public/{studio.slug}/bookings",
        json=_body(studio, (await _slots(async_client, studio))[0]),
    )
    assert response.status_code == 400
    too_long = await async_client.post(
        f"{API}/public/{studio.slug}/bookings",
        headers={"Idempotency-Key": "k" * 256},
        json=_body(studio, (await _slots(async_client, studio))[0]),
    )
    assert too_long.status_code == 422


async def test_concurrent_duplicate_requests_book_once(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    body = _body(studio, starts_at)
    url = f"{API}/public/{studio.slug}/bookings"
    headers = {"Idempotency-Key": "concurrent-key"}
    results = await asyncio.gather(
        async_client.post(url, headers=headers, json=body),
        async_client.post(url, headers=headers, json=body),
    )
    assert [r.status_code for r in results] == [201, 201]
    assert results[0].json() == results[1].json()
    count = await db_async.scalar(
        select(func.count())
        .select_from(Booking)
        .where(Booking.organisation_id == studio.org_id)
    )
    assert count == 1


async def test_two_requests_racing_for_one_slot_get_one_409(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    url = f"{API}/public/{studio.slug}/bookings"
    results = await asyncio.gather(
        *(
            async_client.post(
                url,
                headers={"Idempotency-Key": uuid.uuid4().hex},
                json=_body(studio, starts_at),
            )
            for _ in range(2)
        )
    )
    assert sorted(r.status_code for r in results) == [201, 409]
    loser = next(r for r in results if r.status_code == 409)
    assert "no longer available" in loser.json()["detail"]
    count = await db_async.scalar(
        select(func.count())
        .select_from(Booking)
        .where(Booking.organisation_id == studio.org_id)
    )
    assert count == 1


async def test_racing_without_a_named_provider_uses_the_next_free_one(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client, providers=2)
    starts_at = (await _slots(async_client, studio))[0]
    url = f"{API}/public/{studio.slug}/bookings"
    results = await asyncio.gather(
        *(
            async_client.post(
                url,
                headers={"Idempotency-Key": uuid.uuid4().hex},
                json=_body(studio, starts_at),
            )
            for _ in range(2)
        )
    )
    assert [r.status_code for r in results] == [201, 201]
    providers = {r.json()["booking"]["provider_id"] for r in results}
    assert providers == set(studio.provider_ids)


async def test_a_taken_or_unknown_slot_is_409(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    assert (await _book(async_client, studio, starts_at)).status_code == 201
    assert (await _book(async_client, studio, starts_at)).status_code == 409
    off_grid = await _book(async_client, studio, utc_iso(9, 41))
    assert off_grid.status_code == 409
    wrong_provider = await _book(
        async_client,
        studio,
        (await _slots(async_client, studio))[0],
        provider_id=str(uuid.uuid4()),
    )
    assert wrong_provider.status_code == 409


async def test_honeypot_looks_successful_but_stores_nothing(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    response = await _book(
        async_client, studio, starts_at, website="http://spam.example"
    )
    assert response.status_code == 201
    assert response.json()["manage_token"]
    assert not await db_async.scalar(
        select(func.count())
        .select_from(Booking)
        .where(Booking.organisation_id == studio.org_id)
    )
    assert not await _emails(db_async, studio.org_id)
    assert not await db_async.scalar(
        select(func.count())
        .select_from(IdempotencyKey)
        .where(IdempotencyKey.organisation_id == studio.org_id)
    )
    # The slot is still free.
    assert (await _book(async_client, studio, starts_at)).status_code == 201


# --- entitlement and Turnstile ----------------------------------------------------------


async def test_public_routes_404_without_the_bookings_entitlement(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    receipt = (await _book(async_client, studio, starts_at)).json()
    token = receipt["manage_token"]
    await organisation_service.set_app_enabled(
        db_async, organisation_id=studio.org_id, app_key="bookings", enabled=False
    )
    await db_async.commit()

    assert (await async_client.get(f"{API}/public/{studio.slug}")).status_code == 404
    assert (await _book(async_client, studio, starts_at)).status_code == 404
    for method, suffix in (("GET", ""), ("GET", "/ics"), ("POST", "/cancel")):
        response = await async_client.request(
            method, f"{API}/public/bookings/{token}{suffix}"
        )
        assert response.status_code == 404, suffix
    unknown = await async_client.get(f"{API}/public/bookings/{'x' * 43}")
    assert unknown.status_code == 404


async def test_turnstile_applies_and_a_site_policy_can_turn_it_off(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio = await _studio(db_async, async_client)
    slots = await _slots(async_client, studio)
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_ENABLED", True)
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_SECRET_KEY", "s3cret")
    monkeypatch.setattr(
        turnstile,
        "_transport",
        httpx.MockTransport(lambda _: httpx.Response(200, json={"success": False})),
    )
    assert (await _book(async_client, studio, slots[0])).status_code == 400
    assert (
        await _book(async_client, studio, slots[0], turnstile_token="bad")
    ).status_code == 400

    monkeypatch.setattr(
        turnstile,
        "_transport",
        httpx.MockTransport(lambda _: httpx.Response(200, json={"success": True})),
    )
    assert (
        await _book(async_client, studio, slots[0], turnstile_token="good")
    ).status_code == 201

    # The organisation's own site (named like the booking slug) switches it off.
    db_async.add(
        PublicSite(
            id=new_public_site_id(),
            organisation_id=studio.org_id,
            key=studio.slug,
            name="Salon site",
            accepts_contact=False,
            accepts_subscriptions=False,
            turnstile_mode="off",
        )
    )
    await db_async.commit()
    monkeypatch.setattr(
        turnstile,
        "_transport",
        httpx.MockTransport(lambda _: httpx.Response(200, json={"success": False})),
    )
    assert (await _book(async_client, studio, slots[-1])).status_code == 201


async def test_a_replay_does_not_need_a_second_turnstile_token(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Tokens are single-use: a retry after a lost response must still get its receipt."""
    studio = await _studio(db_async, async_client)
    slot = (await _slots(async_client, studio))[0]
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_ENABLED", True)
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_SECRET_KEY", "s3cret")
    verdicts = iter([True, False, False])
    monkeypatch.setattr(
        turnstile,
        "_transport",
        httpx.MockTransport(
            lambda _: httpx.Response(200, json={"success": next(verdicts)})
        ),
    )
    key = uuid.uuid4().hex
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"  # the same body on a retry
    first = await _book(
        async_client,
        studio,
        slot,
        key=key,
        customer_email=email,
        turnstile_token="once",
    )
    assert first.status_code == 201, first.text

    # Same key and body, the token already spent: replayed, Cloudflare not asked.
    replay = await _book(
        async_client,
        studio,
        slot,
        key=key,
        customer_email=email,
        turnstile_token="spent",
    )
    assert replay.status_code == 201
    assert replay.headers["Idempotency-Replayed"] == "true"
    assert replay.json() == first.json()

    # A new key still has to pass the check.
    other = await _book(async_client, studio, slot, turnstile_token="bad")
    assert other.status_code == 400


async def test_a_failed_turnstile_check_releases_the_key(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio = await _studio(db_async, async_client)
    slot = (await _slots(async_client, studio))[0]
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_ENABLED", True)
    monkeypatch.setattr(turnstile.turnstile_settings, "TURNSTILE_SECRET_KEY", "s3cret")
    verdicts = iter([False, True])
    monkeypatch.setattr(
        turnstile,
        "_transport",
        httpx.MockTransport(
            lambda _: httpx.Response(200, json={"success": next(verdicts)})
        ),
    )
    key = uuid.uuid4().hex
    email = f"ada-{uuid.uuid4().hex[:8]}@example.com"
    rejected = await _book(
        async_client, studio, slot, key=key, customer_email=email, turnstile_token="bad"
    )
    assert rejected.status_code == 400
    retried = await _book(
        async_client,
        studio,
        slot,
        key=key,
        customer_email=email,
        turnstile_token="good",
    )
    assert retried.status_code == 201, retried.text
    assert "Idempotency-Replayed" not in retried.headers


# --- manage, cancel, reschedule, ICS ----------------------------------------------------


async def _booked(
    db: AsyncSession, client: httpx.AsyncClient, **profile: object
) -> tuple[Studio, dict[str, object], list[str]]:
    studio = await _studio(db, client, **profile)
    slots = await _slots(client, studio)
    response = await _book(client, studio, slots[0])
    assert response.status_code == 201, response.text
    return studio, response.json(), slots


async def test_get_booking_by_token(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt, _ = await _booked(db_async, async_client)
    token = receipt["manage_token"]
    response = await async_client.get(f"{API}/public/bookings/{token}")
    assert response.status_code == 200
    assert response.json() == receipt["booking"]
    assert response.json()["service_name"] == "Classic full set"
    assert "customer_email" not in response.json()
    assert (
        await async_client.get(f"{API}/public/bookings/{'a' * 43}")
    ).status_code == 404
    assert (await async_client.get(f"{API}/public/bookings/short")).status_code == 422


async def test_cancel_frees_the_slot_logs_an_event_and_queues_email(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt, slots = await _booked(db_async, async_client)
    token = receipt["manage_token"]
    url = f"{API}/public/bookings/{token}/cancel"
    response = await async_client.post(url, json={"reason": "Sick"})
    assert response.status_code == 200, response.text
    assert response.json()["status"] == "cancelled"
    assert response.json()["can_cancel"] is False
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    assert booking.cancelled_at is not None
    assert booking.cancel_reason == "Sick"
    events = list(
        await db_async.scalars(
            select(BookingEvent)
            .where(BookingEvent.booking_id == booking.id)
            .order_by(BookingEvent.created_at)
        )
    )
    assert [e.to_status for e in events] == ["confirmed", "cancelled"]
    assert (await async_client.post(url)).status_code == 200  # repeat is harmless
    keys = [row.dedupe_key for row in await _emails(db_async, studio.org_id)]
    assert sorted(keys) == sorted(
        [
            f"booking-confirmation:{booking.id}",
            f"booking-studio-created:{booking.id}",
            f"booking-cancelled:{booking.id}",
            f"booking-studio-cancelled:{booking.id}",
        ]
    )
    # The slot is bookable again.
    assert slots[0] in await _slots(async_client, studio)


async def test_cancel_inside_the_cutoff_is_409(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio, receipt, _ = await _booked(db_async, async_client, cancel_cutoff_hours=24)
    starts_at = datetime.fromisoformat(receipt["booking"]["starts_at"]).replace(
        tzinfo=None
    )
    token = receipt["manage_token"]
    url = f"{API}/public/bookings/{token}/cancel"

    monkeypatch.setattr(public, "utc_now", lambda: starts_at - timedelta(hours=23))
    assert (await async_client.get(f"{API}/public/bookings/{token}")).json()[
        "can_cancel"
    ] is False
    refused = await async_client.post(url)
    assert refused.status_code == 409
    assert "24 hours" in refused.json()["detail"]
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    assert booking.status == BookingStatus.CONFIRMED.value

    monkeypatch.setattr(public, "utc_now", lambda: starts_at - timedelta(hours=25))
    assert (await async_client.post(url)).status_code == 200


async def test_cancelling_a_finished_booking_is_409(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, receipt, _ = await _booked(db_async, async_client)
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    await public.transition(db_async, booking, BookingStatus.COMPLETED)
    await db_async.commit()
    response = await async_client.post(
        f"{API}/public/bookings/{receipt['manage_token']}/cancel"
    )
    assert response.status_code == 409


async def test_reschedule_moves_the_booking_and_keeps_it_active(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt, slots = await _booked(db_async, async_client)
    token = receipt["manage_token"]
    # The booking's own blocked range must not make a nearby slot look taken.
    target = next(
        s for s in slots if s > receipt["booking"]["starts_at"] and s < utc_iso(11, 30)
    )
    response = await async_client.post(
        f"{API}/public/bookings/{token}/reschedule", json={"starts_at": target}
    )
    assert response.status_code == 200, response.text
    moved = response.json()
    assert moved["starts_at"] == target
    assert moved["status"] == "confirmed"
    assert moved["provider_id"] == receipt["booking"]["provider_id"]
    assert moved["service_id"] == receipt["booking"]["service_id"]
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    assert booking.starts_at == datetime.fromisoformat(target).replace(tzinfo=None)
    assert booking.ends_at - booking.starts_at == timedelta(minutes=120)
    events = list(
        await db_async.scalars(
            select(BookingEvent)
            .where(BookingEvent.booking_id == booking.id)
            .order_by(BookingEvent.created_at)
        )
    )
    assert [(e.from_status, e.to_status) for e in events] == [
        (None, "confirmed"),
        ("confirmed", "confirmed"),
    ]
    assert "Rescheduled" in (events[-1].note or "")
    # The same token still works; the old time is free again.
    assert (await async_client.get(f"{API}/public/bookings/{token}")).json()[
        "starts_at"
    ] == target
    kinds = [
        row.dedupe_key.split(":")[0] for row in await _emails(db_async, studio.org_id)
    ]
    assert "booking-rescheduled" in kinds
    assert "booking-studio-rescheduled" in kinds


async def test_reschedule_to_a_taken_slot_or_inside_the_cutoff_is_409(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    studio, receipt, slots = await _booked(db_async, async_client)
    token = receipt["manage_token"]
    other = (await _book(async_client, studio, slots[-1])).json()
    taken = await async_client.post(
        f"{API}/public/bookings/{token}/reschedule",
        json={"starts_at": other["booking"]["starts_at"]},
    )
    assert taken.status_code == 409
    nonsense = await async_client.post(
        f"{API}/public/bookings/{token}/reschedule",
        json={"starts_at": utc_iso(23)},  # 23:00 local: after hours
    )
    assert nonsense.status_code == 409
    starts_at = datetime.fromisoformat(receipt["booking"]["starts_at"]).replace(
        tzinfo=None
    )
    monkeypatch.setattr(public, "utc_now", lambda: starts_at - timedelta(hours=2))
    late = await async_client.post(
        f"{API}/public/bookings/{token}/reschedule", json={"starts_at": slots[2]}
    )
    assert late.status_code == 409
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    assert booking.starts_at == starts_at


async def test_ics_download(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    _, receipt, _ = await _booked(db_async, async_client)
    token = receipt["manage_token"]
    response = await async_client.get(f"{API}/public/bookings/{token}/ics")
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/calendar")
    text = response.content.decode()
    assert text.startswith("BEGIN:VCALENDAR\r\n")
    assert f"UID:booking-{receipt['booking']['id']}@barrels.gd\r\n" in text
    assert f"DTSTART:{MONDAY:%Y%m%d}T133000Z\r\n" in text
    assert "SUMMARY:Classic full set at Babydoll Beauty Bar\r\n" in text
    assert "STATUS:CONFIRMED\r\n" in text
    await async_client.post(f"{API}/public/bookings/{token}/cancel")
    cancelled = (await async_client.get(f"{API}/public/bookings/{token}/ics")).text
    assert "STATUS:CANCELLED\r\n" in cancelled
    assert "SEQUENCE:1\r\n" in cancelled


# --- emails through the outbox -----------------------------------------------------------


async def test_emails_are_queued_on_the_outbox_with_a_manage_link(
    db_async: AsyncSession,
    async_client: httpx.AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
    outbound_email_calls: list[dict[str, str]],
) -> None:
    monkeypatch.setattr(email_settings, "EMAILS_FROM_EMAIL", "noreply@example.com")
    monkeypatch.setattr(email_settings, "RESEND_API_KEY", "re_test")
    monkeypatch.setattr(email_settings, "EMAIL_RENDER_URL", None)
    studio, receipt, _ = await _booked(db_async, async_client)
    rows = await _emails(db_async, studio.org_id)
    by_key = {row.dedupe_key.split(":")[0]: row for row in rows}
    assert set(by_key) == {"booking-confirmation", "booking-studio-created"}
    customer = by_key["booking-confirmation"].payload
    assert customer["transactional"] is True
    assert receipt["manage_url"] in customer["html"]
    assert "confirmed" in customer["subject"]
    studio_mail = by_key["booking-studio-created"].payload
    assert studio_mail["to_email"] == "studio@example.com"
    assert receipt["manage_url"] not in studio_mail["html"]
    # The handler turns a row into a real outbound email.
    await outbox_handlers.send_email(
        db_async,
        outbox.OutboxMessage(
            id=by_key["booking-confirmation"].id,
            organisation_id=studio.org_id,
            topic=outbox_handlers.EMAIL_SEND,
            payload=customer,
            dedupe_key="x",
            attempts=0,
        ),
    )
    sent = await db_async.scalar(
        select(OutboundEmail).where(
            OutboundEmail.to_email == customer["to_email"].lower()
        )
    )
    assert sent is not None
    assert outbound_email_calls == [
        {
            "email_to": customer["to_email"].lower(),
            "subject": customer["subject"],
            "html_content": customer["html"],
        }
    ]
    await db_async.rollback()


async def test_a_failed_create_queues_no_email(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    starts_at = (await _slots(async_client, studio))[0]
    await _book(async_client, studio, starts_at)
    before = len(await _emails(db_async, studio.org_id))
    assert (await _book(async_client, studio, starts_at)).status_code == 409
    assert len(await _emails(db_async, studio.org_id)) == before


# --- reminders -------------------------------------------------------------------------


async def test_reminders_are_queued_once_per_booking(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt, _ = await _booked(db_async, async_client)
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    starts_at = booking.starts_at
    outside = starts_at - timedelta(hours=30)
    assert (
        await reminders.enqueue_due_reminders(
            db_async, now=outside, organisation_id=studio.org_id
        )
        == 0
    )

    inside = starts_at - timedelta(hours=20)
    once = {"organisation_id": studio.org_id}
    assert await reminders.enqueue_due_reminders(db_async, now=inside, **once) == 1
    await db_async.commit()
    assert await reminders.enqueue_due_reminders(db_async, now=inside, **once) == 0
    later = inside + timedelta(hours=1)
    assert await reminders.enqueue_due_reminders(db_async, now=later, **once) == 0
    await db_async.commit()
    rows = [
        row
        for row in await _emails(db_async, studio.org_id)
        if row.dedupe_key == f"booking-reminder:{booking.id}"
    ]
    assert len(rows) == 1
    assert "Reminder" in rows[0].payload["subject"]
    assert receipt["manage_token"] not in rows[0].payload["html"]


async def test_cancelled_and_past_bookings_get_no_reminder(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio, receipt, _ = await _booked(db_async, async_client)
    await async_client.post(f"{API}/public/bookings/{receipt['manage_token']}/cancel")
    booking = await _booking_for(db_async, receipt["booking"]["id"])
    once = {"organisation_id": studio.org_id}
    for moment in (
        booking.starts_at - timedelta(hours=20),
        booking.starts_at + timedelta(hours=1),
    ):
        assert await reminders.enqueue_due_reminders(db_async, now=moment, **once) == 0
    await db_async.commit()
    assert not [
        row
        for row in await _emails(db_async, studio.org_id)
        if row.dedupe_key.startswith("booking-reminder")
    ]


def test_manage_token_helpers() -> None:
    token, digest = public.new_manage_token()
    assert digest == hashlib.sha256(token.encode()).hexdigest()
    assert public.new_manage_token()[0] != token
    assert utc_now() is not None


async def test_reserved_slug_is_refused(
    db_async: AsyncSession, async_client: httpx.AsyncClient
) -> None:
    studio = await _studio(db_async, async_client)
    response = await async_client.put(
        f"{API}/org/profile",
        headers=studio.headers,
        json={"public_slug": "bookings", "display_name": "X"},
    )
    assert response.status_code == 422


class _PgError(Exception):
    def __init__(self, message: str, sqlstate: str | None = None) -> None:
        super().__init__(message)
        self.sqlstate = sqlstate


def test_overlap_and_deadlock_victims_both_count_as_a_lost_race() -> None:
    overlap = DBAPIError("insert", {}, _PgError('violates "booking_no_overlap"'))
    deadlock = DBAPIError("insert", {}, _PgError("deadlock detected", "40P01"))
    other = DBAPIError("insert", {}, _PgError("connection reset", "08006"))
    assert public.service.is_overlap_violation(overlap)
    assert public.service.is_overlap_violation(deadlock)
    assert not public.service.is_overlap_violation(other)
