"""Orders and tickets (E1): inventory guard, per-account limits, cancel, QR token."""

import asyncio
from datetime import timedelta
from typing import Any
from uuid import UUID

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.events import outbox, tickets
from src.events.exceptions import EventsConflict
from src.events.models import Listing, Order, Organiser, Ticket, TicketTier
from src.notifications.models import Notification
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import (
    BASE,
    SessionFactory,
    client_as,
    client_with_real_roles,
    drain_notifications,
    make_user,
    queued,
)
from tests.events.test_organiser_admin import MANAGE, _organiser, _payload


async def _event(
    factory: SessionFactory,
    *,
    allocation: int = 3,
    limit: int = 4,
    price: int = 0,
    starts_in: timedelta = timedelta(days=3),
    admission: str = "ticketed",
    status: str = "published",
    slug: str = "free-night",
) -> dict[str, Any]:
    now = utc_now()
    async with factory() as db:
        organiser = Organiser(slug=f"org-{slug}", name="Crew", verified=True)
        db.add(organiser)
        await db.flush()
        listing = Listing(
            slug=slug,
            title="Free Night",
            summary="Registration only",
            category="culture",
            parish="st-george",
            venue="Carenage",
            starts_at=now + starts_in,
            ends_at=now + starts_in + timedelta(hours=4),
            admission=admission,
            capacity=1000,
            organiser_id=organiser.id,
            status=status,
        )
        db.add(listing)
        await db.flush()
        tier = TicketTier(
            listing_id=listing.id,
            name="Registration",
            price_minor=price,
            allocation=allocation,
            per_account_limit=limit,
        )
        db.add(tier)
        await db.commit()
        return {"slug": slug, "tier": tier.id, "listing": listing.id}


async def _claim(user, event: dict[str, Any], quantity: int = 1):
    async with client_as(user) as client:
        return await client.post(
            f"{BASE}/listings/{event['slug']}/orders",
            json={"items": [{"tier_id": str(event["tier"]), "quantity": quantity}]},
        )


async def _valid(factory: SessionFactory) -> int:
    async with factory() as db:
        return int(
            await db.scalar(
                select(func.count()).select_from(Ticket).where(Ticket.status == "valid")
            )
            or 0
        )


@pytest.mark.asyncio
async def test_claiming_issues_tickets_with_a_signed_qr_that_holds_no_personal_data(
    events_db: SessionFactory,
):
    event = await _event(events_db)
    user = make_user("Zed")
    response = await _claim(user, event, 2)
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["total_minor"] == 0
    assert len(order["tickets"]) == 2

    async with client_as(user) as client:
        mine = (await client.get(f"{BASE}/me/tickets")).json()
        assert [row["id"] for row in mine] == [row["id"] for row in order["tickets"]]
        assert all(row["can_cancel"] and row["status"] == "valid" for row in mine)
        detail = (await client.get(f"{BASE}/me/tickets/{mine[0]['id']}")).json()
    token = detail["qr_token"]
    assert token.startswith("BT1.")
    code = detail["code"].replace("-", "")
    # The token is exactly prefix, opaque code and tag. A short name such as
    # "Zed" can appear inside a random code by chance, so the structure is
    # asserted instead of searching for it; email and id are long enough to
    # search for.
    prefix, token_code, tag = token.split(".")
    assert (prefix, token_code.replace("-", "")) == ("BT1", code)
    assert tag
    for private in (user.email, str(user.id)):
        assert private.lower() not in token.lower()
    assert tickets.code_from_scan(token) == code
    assert tickets.code_from_scan(detail["code"].lower()) == code
    forged = f"BT1.{code}.{'A' * 16}"
    with pytest.raises(EventsConflict):
        tickets.code_from_scan(forged)

    async with client_as(make_user("Other")) as client:
        assert (await client.get(f"{BASE}/me/tickets")).json() == []
        assert (
            await client.get(f"{BASE}/me/tickets/{mine[0]['id']}")
        ).status_code == 404

    async with client_as(None) as client:
        anonymous = await client.get(f"{BASE}/me/tickets")
        assert anonymous.status_code == 401
        listing = (await client.get(f"{BASE}/listings/free-night")).json()
    assert listing["tiers"][0]["remaining"] == 1
    assert listing["tiers"][0]["per_account_limit"] == 4


@pytest.mark.asyncio
async def test_per_account_limit_is_enforced_per_tier(events_db: SessionFactory):
    event = await _event(events_db, allocation=50, limit=2)
    user = make_user("Lim")
    assert (await _claim(user, event, 2)).status_code == 201
    over = await _claim(user, event, 1)
    assert over.status_code == 409
    assert "up to 2" in over.json()["detail"]
    too_many_at_once = await _claim(make_user("Many"), event, 3)
    assert too_many_at_once.status_code == 409
    assert (await _claim(make_user("Fresh"), event, 2)).status_code == 201

    async with client_as(user) as client:
        listing = (await client.get(f"{BASE}/listings/free-night")).json()
        assert listing["tiers"][0]["held"] == 2
        first = (await client.get(f"{BASE}/me/tickets")).json()[0]
        assert (
            await client.post(f"{BASE}/me/tickets/{first['id']}/cancel")
        ).status_code == 200
    assert (await _claim(user, event, 1)).status_code == 201  # a cancel frees the limit


@pytest.mark.asyncio
async def test_default_limit_is_four(events_db: SessionFactory):
    event = await _event(events_db, allocation=50)
    async with events_db() as db:
        tier = await db.get(TicketTier, event["tier"])
        assert tier is not None
        assert tier.per_account_limit == 4


@pytest.mark.asyncio
async def test_concurrent_claims_never_oversell(events_db: SessionFactory):
    event = await _event(events_db, allocation=3)
    users = [make_user(f"Racer{index}") for index in range(10)]
    results = await asyncio.gather(*(_claim(user, event, 1) for user in users))
    statuses = sorted(response.status_code for response in results)
    assert statuses == [201] * 3 + [409] * 7
    assert await _valid(events_db) == 3


@pytest.mark.asyncio
async def test_concurrent_claims_by_one_account_respect_the_limit(
    events_db: SessionFactory,
):
    event = await _event(events_db, allocation=50, limit=2)
    user = make_user("Eager")
    results = await asyncio.gather(*(_claim(user, event, 1) for _ in range(6)))
    assert sorted(response.status_code for response in results) == [201] * 2 + [409] * 4
    assert await _valid(events_db) == 2


@pytest.mark.asyncio
async def test_cancelling_releases_inventory(events_db: SessionFactory):
    event = await _event(events_db, allocation=1)
    holder, waiting = make_user("Holder"), make_user("Waiting")
    ticket_id = (await _claim(holder, event)).json()["tickets"][0]["id"]
    sold_out = await _claim(waiting, event)
    assert sold_out.status_code == 409
    assert "sold out" in sold_out.json()["detail"]

    async with client_as(waiting) as client:  # not theirs
        assert (
            await client.post(f"{BASE}/me/tickets/{ticket_id}/cancel")
        ).status_code == 404
    async with client_as(holder) as client:
        cancelled = await client.post(f"{BASE}/me/tickets/{ticket_id}/cancel")
        assert cancelled.status_code == 200
        assert cancelled.json()["status"] == "cancelled"
        assert cancelled.json()["can_cancel"] is False
        again = await client.post(f"{BASE}/me/tickets/{ticket_id}/cancel")
        assert again.status_code == 409
    assert (await _claim(waiting, event)).status_code == 201
    assert await _valid(events_db) == 1


@pytest.mark.asyncio
async def test_started_events_keep_their_tickets(events_db: SessionFactory):
    event = await _event(events_db, starts_in=timedelta(minutes=5))
    user = make_user("Late")
    ticket_id = (await _claim(user, event)).json()["tickets"][0]["id"]
    async with events_db() as db:
        listing = await db.get(Listing, event["listing"])
        assert listing is not None
        listing.starts_at = utc_now() - timedelta(minutes=1)
        await db.commit()
    async with client_as(user) as client:
        refused = await client.post(f"{BASE}/me/tickets/{ticket_id}/cancel")
        assert refused.status_code == 409
        assert "started" in refused.json()["detail"]
    assert await _valid(events_db) == 1


@pytest.mark.asyncio
async def test_claims_are_refused_when_they_cannot_be_honoured(
    events_db: SessionFactory,
):
    user = make_user("Nope")
    paid = await _event(events_db, price=5000, slug="paid-night")
    refused = await _claim(user, paid)
    assert refused.status_code == 409
    assert "online payment" in refused.json()["detail"]

    rsvp = await _event(events_db, admission="rsvp", slug="rsvp-night")
    assert (await _claim(user, rsvp)).status_code == 409

    draft = await _event(events_db, status="draft", slug="draft-night")
    assert (await _claim(user, draft)).status_code == 404

    ended = await _event(events_db, starts_in=-timedelta(days=2), slug="old-night")
    assert (await _claim(user, ended)).status_code == 409

    free = await _event(events_db, slug="other-night")
    async with client_as(user) as client:
        wrong_tier = await client.post(
            f"{BASE}/listings/other-night/orders",
            json={"items": [{"tier_id": str(paid["tier"]), "quantity": 1}]},
        )
        assert wrong_tier.status_code == 404
    async with client_as(None) as client:
        signed_out = await client.post(
            f"{BASE}/listings/other-night/orders",
            json={"items": [{"tier_id": str(free["tier"]), "quantity": 1}]},
        )
        assert signed_out.status_code == 401
    assert await _valid(events_db) == 0


@pytest.mark.asyncio
async def test_tier_edits_keep_issued_tickets(
    events_db: SessionFactory, db_async: AsyncSession
):
    """Saving a listing updates tiers in place; tiers with tickets cannot vanish."""
    organiser = await _organiser(events_db, db_async)
    free_tier = {"name": "Free", "price_minor": 0, "allocation": 5}
    async with client_with_real_roles(organiser) as client:
        created = await client.post(MANAGE, json=_payload(tiers=[free_tier]))
        assert created.status_code == 201, created.text
        listing = created.json()
        tier = listing["tiers"][0]
        assert tier["per_account_limit"] == 4
    event = {"slug": listing["slug"], "tier": UUID(tier["id"])}
    assert (await _claim(make_user("Keep"), event, 2)).status_code == 201

    async with client_with_real_roles(organiser) as client:
        path = f"{MANAGE}/{listing['id']}"
        removed = await client.put(path, json=_payload(tiers=[]))
        assert removed.status_code == 409
        replaced = await client.put(path, json=_payload(tiers=[free_tier]))
        assert replaced.status_code == 409
        assert "tickets issued" in replaced.json()["detail"]
        shrunk = await client.put(
            path,
            json=_payload(tiers=[{**free_tier, "id": tier["id"], "allocation": 1}]),
        )
        assert shrunk.status_code == 409
        assert "allocation" in shrunk.json()["detail"]
        edited = await client.put(
            path,
            json=_payload(
                tiers=[{**free_tier, "id": tier["id"], "per_account_limit": 6}]
            ),
        )
        assert edited.status_code == 200, edited.text
        after = edited.json()["tiers"][0]
        assert after["id"] == tier["id"]
        assert after["per_account_limit"] == 6
        assert after["remaining"] == 3
    assert await _valid(events_db) == 2


@pytest.mark.asyncio
async def test_ticket_issued_notification_goes_through_the_outbox(
    events_db: SessionFactory, db_async: AsyncSession
):
    event = await _event(events_db)
    user = await user_with_role(db_async, None)
    assert (await _claim(user, event, 2)).status_code == 201
    rows = await queued(events_db)
    async with events_db() as db:
        order = await db.scalar(select(Order))
    assert [row.payload["kind"] for row in rows] == [outbox.TICKET_ISSUED]
    assert order is not None
    assert rows[0].payload["entity_id"] == str(order.id)
    assert "@" not in str(rows[0].payload)
    assert await drain_notifications(events_db) == 1
    assert await drain_notifications(events_db) == 0
    sent = (
        await db_async.execute(
            select(Notification.recipient_user_id, Notification.title).where(
                Notification.event_key == "events.ticket_issued"
            )
        )
    ).all()
    assert [(row.recipient_user_id, "Free Night" in row.title) for row in sent] == [
        (user.id, True)
    ]
