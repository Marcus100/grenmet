"""Outlet cash sales (E3): shared inventory, tills, access, activity."""

import asyncio
import uuid
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.events import schemas, service
from src.events.exceptions import EventsConflict
from src.events.models import (
    Activity,
    Admission,
    Listing,
    Order,
    OrganiserMember,
    Ticket,
)
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import (
    BASE,
    SessionFactory,
    client_as,
    client_with_real_roles,
    make_user,
    profiles,
)
from tests.events.test_organiser_admin import MANAGE, _organiser, _payload

PAID = {"name": "General", "price_minor": 2500, "allocation": 10}
FREE = {"name": "Free", "price_minor": 0, "allocation": 5}


async def cash_event(
    factory: SessionFactory,
    db_async: AsyncSession,
    tier: dict[str, Any] | None = None,
) -> tuple[User, dict[str, Any]]:
    """A verified organiser (admin staff) and a published ticketed event."""
    staff = await _organiser(factory, db_async)
    await profiles(factory, staff)
    async with client_with_real_roles(staff) as client:
        created = await client.post(MANAGE, json=_payload(tiers=[tier or PAID]))
        assert created.status_code == 201, created.text
        listing = created.json()
    return staff, {
        "slug": listing["slug"],
        "listing": listing["id"],
        "tier": listing["tiers"][0]["id"],
    }


def outlet(event: dict[str, Any], tail: str = "") -> str:
    return f"{BASE}/manage/{event['listing']}/outlet{tail}"


def sale(
    event: dict[str, Any], quantity: int, collected: int, **extra: Any
) -> dict[str, Any]:
    return {
        "items": [{"tier_id": event["tier"], "quantity": quantity}],
        "amount_collected_minor": collected,
        **extra,
    }


async def open_till(staff: User, event: dict[str, Any], float_minor: int = 10000):
    async with client_with_real_roles(staff) as client:
        response = await client.post(
            outlet(event, "/till"), json={"opening_float_minor": float_minor}
        )
    assert response.status_code == 201, response.text
    return response.json()


async def sell(staff: User, event: dict[str, Any], quantity: int, collected: int, **x):
    async with client_with_real_roles(staff) as client:
        return await client.post(
            outlet(event, "/sales"), json=sale(event, quantity, collected, **x)
        )


@pytest.mark.asyncio
async def test_outlet_sale_issues_scannable_tickets_without_an_account(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    till = await open_till(staff, event)
    assert till["status"] == "open"
    assert till["expected_minor"] == 10000

    response = await sell(
        staff, event, 2, 5000, buyer_name="Marcia", buyer_phone="473-555-0101"
    )
    assert response.status_code == 201, response.text
    body = response.json()
    assert body["total_minor"] == body["collected_minor"] == 5000
    assert body["buyer_name"] == "Marcia"
    assert len(body["tickets"]) == 2
    assert all(row["qr_token"].startswith("BT1.") for row in body["tickets"])
    assert "Marcia" not in body["tickets"][0]["qr_token"]

    async with events_db() as db:
        order = await db.get(Order, body["order_id"])
        assert order is not None
        assert (order.channel, order.payment_method) == ("outlet", "cash_outlet")
        assert order.user_id is None
        assert order.sold_by == staff.id
        issued = (await db.scalars(select(Ticket))).all()
        assert all(row.user_id is None for row in issued)

    # The printed QR admits at the door and the manifest names the buyer.
    async with client_with_real_roles(staff) as client:
        scan = await client.post(
            f"{BASE}/manage/{event['listing']}/admissions",
            json={"code": body["tickets"][0]["qr_token"]},
        )
        assert scan.status_code == 200, scan.text
        assert scan.json()["holder_name"] == "Marcia"
        manifest = (
            await client.get(f"{BASE}/manage/{event['listing']}/manifest")
        ).json()
        assert {row["channel"] for row in manifest["rows"]} == {"outlet"}
        assert manifest["issued"] == 2
        assert manifest["admitted"] == 1
        screen = (await client.get(outlet(event))).json()
        assert screen["tiers"][0]["sold"] == 2
        assert screen["tiers"][0]["remaining"] == 8
        assert screen["till"]["collected_minor"] == 5000
        assert screen["till"]["expected_minor"] == 15000
        assert [row["order_id"] for row in screen["sales"]] == [body["order_id"]]
        again = await client.get(outlet(event, f"/sales/{body['order_id']}"))
        assert again.json()["tickets"][0]["code"] == body["tickets"][0]["code"]

    async with events_db() as db:
        rows = (
            await db.scalars(
                select(Activity).where(
                    Activity.action.in_(["till.opened", "ticket.sold_outlet"])
                )
            )
        ).all()
    assert {row.action for row in rows} == {"till.opened", "ticket.sold_outlet"}
    assert all(row.actor_id == staff.id for row in rows)
    assert all("Marcia" not in str(row.summary) for row in rows)
    assert all("555" not in str(row.summary) for row in rows)


@pytest.mark.asyncio
async def test_a_sale_needs_an_open_till_and_the_exact_amount(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    no_till = await sell(staff, event, 1, 2500)
    assert no_till.status_code == 409
    assert "Open your till" in no_till.json()["detail"]

    await open_till(staff, event)
    async with client_with_real_roles(staff) as client:
        twice = await client.post(
            outlet(event, "/till"), json={"opening_float_minor": 0}
        )
        assert twice.status_code == 409
    short = await sell(staff, event, 2, 4000)
    assert short.status_code == 409
    assert "EC$50.00" in short.json()["detail"]
    async with events_db() as db:
        assert await db.scalar(select(func.count()).select_from(Ticket)) == 0


@pytest.mark.asyncio
async def test_closing_a_till_records_the_count_and_blocks_more_sales(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    await open_till(staff, event, 10000)
    assert (await sell(staff, event, 2, 5000)).status_code == 201
    async with client_with_real_roles(staff) as client:
        closed = await client.post(
            outlet(event, "/till/close"),
            json={"counted_minor": 14000, "note": "dropped a note"},
        )
        assert closed.status_code == 200, closed.text
        till = closed.json()
        assert till["status"] == "closed"
        assert till["expected_minor"] == 15000
        assert till["counted_minor"] == 14000
        assert till["difference_minor"] == -1000
        assert (
            await client.post(outlet(event, "/till/close"), json={"counted_minor": 1})
        ).status_code == 409
    after = await sell(staff, event, 1, 2500)
    assert after.status_code == 409
    assert "closed" in after.json()["detail"]


@pytest.mark.asyncio
async def test_a_retried_sale_replays_instead_of_selling_twice(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    await open_till(staff, event)
    first = await sell(staff, event, 1, 2500, idempotency_key="sale-1")
    second = await sell(staff, event, 1, 2500, idempotency_key="sale-1")
    assert first.status_code == second.status_code == 201
    assert second.json()["repeat"] is True
    assert second.json()["order_id"] == first.json()["order_id"]
    async with events_db() as db:
        assert await db.scalar(select(func.count()).select_from(Ticket)) == 1


@pytest.mark.asyncio
async def test_outlet_and_online_share_one_inventory_and_the_account_limit_is_online_only(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(
        events_db, db_async, {"name": "Free", "price_minor": 0, "allocation": 6}
    )
    await open_till(staff, event, 0)
    # More than the per-account limit (4) in one outlet sale is fine.
    assert (await sell(staff, event, 5, 0)).status_code == 201
    async with client_as(make_user("Online")) as client:
        over = await client.post(
            f"{BASE}/listings/{event['slug']}/orders",
            json={"items": [{"tier_id": event["tier"], "quantity": 2}]},
        )
    assert over.status_code == 409
    assert "Only 1" in over.json()["detail"]
    full = await sell(staff, event, 2, 0)
    assert full.status_code == 409
    assert "Only 1" in full.json()["detail"]
    assert (await sell(staff, event, 1, 0)).status_code == 201
    final = await sell(staff, event, 1, 0)
    assert final.status_code == 409
    assert "sold out" in final.json()["detail"]


@pytest.mark.asyncio
async def test_concurrent_outlet_and_online_sales_never_oversell(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async, FREE)
    await open_till(staff, event, 0)

    async def outlet_sale(index: int):
        async with events_db() as db:
            return await service.sell_tickets(
                db,
                staff,
                uuid.UUID(event["listing"]),
                schemas.OutletSaleCreate.model_validate(
                    sale(event, 2, 0, idempotency_key=f"race-{index}")
                ),
                [],
            )

    async def online_claim(index: int):
        async with events_db() as db:
            return await service.claim_tickets(
                db,
                make_user(f"Racer{index}"),
                event["slug"],
                schemas.OrderCreate.model_validate(
                    {"items": [{"tier_id": event["tier"], "quantity": 2}]}
                ),
            )

    results = await asyncio.gather(
        *(outlet_sale(index) for index in range(4)),
        *(online_claim(index) for index in range(4)),
        return_exceptions=True,
    )
    refused = [row for row in results if isinstance(row, EventsConflict)]
    assert all(
        isinstance(row, EventsConflict) for row in results if isinstance(row, Exception)
    )
    assert len(results) - len(refused) == 2  # 5 seats, two per request
    async with events_db() as db:
        valid = await db.scalar(
            select(func.count()).select_from(Ticket).where(Ticket.status == "valid")
        )
    assert valid == 4


@pytest.mark.asyncio
async def test_only_the_organisers_admin_staff_can_sell(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    await open_till(staff, event)

    plain = await user_with_role(db_async, "events-member")
    async with client_with_real_roles(plain) as client:
        assert (await client.get(outlet(event))).status_code == 403
        assert (
            await client.post(outlet(event, "/sales"), json=sale(event, 1, 2500))
        ).status_code == 403
    unattached = await user_with_role(db_async, "events-organiser")
    async with client_with_real_roles(unattached) as client:
        assert (
            await client.post(outlet(event, "/sales"), json=sale(event, 1, 2500))
        ).status_code == 403
    other = await _organiser(events_db, db_async, "other-crew")
    async with client_with_real_roles(other) as client:
        assert (await client.get(outlet(event))).status_code == 404
        assert (
            await client.post(outlet(event, "/till"), json={"opening_float_minor": 0})
        ).status_code == 404
        assert (
            await client.post(outlet(event, "/sales"), json=sale(event, 1, 2500))
        ).status_code == 404
    async with events_db() as db:
        assert await db.scalar(select(func.count()).select_from(Ticket)) == 0


@pytest.mark.asyncio
async def test_each_staff_member_keeps_their_own_till(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    async with events_db() as db:
        listing = await db.get(Listing, event["listing"])
        assert listing is not None
        second = await user_with_role(db_async, "events-organiser")
        db.add(OrganiserMember(organiser_id=listing.organiser_id, user_id=second.id))
        await db.commit()
    first_till = await open_till(staff, event, 5000)
    second_till = await open_till(second, event, 2000)
    assert first_till["id"] != second_till["id"]
    assert (await sell(second, event, 1, 2500)).status_code == 201
    async with client_with_real_roles(staff) as client:
        mine = (await client.get(outlet(event))).json()
    assert mine["till"]["id"] == first_till["id"]
    assert mine["till"]["expected_minor"] == 5000
    assert len(mine["sales"]) == 1


@pytest.mark.asyncio
async def test_no_outlet_sales_once_the_event_is_over_or_off(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    await open_till(staff, event)
    async with events_db() as db:
        await db.execute(
            update(Listing)
            .where(Listing.id == event["listing"])
            .values(
                starts_at=utc_now() - timedelta(hours=6),
                ends_at=utc_now() - timedelta(hours=1),
            )
        )
        await db.commit()
    ended = await sell(staff, event, 1, 2500)
    assert ended.status_code == 409
    assert "ended" in ended.json()["detail"]
    async with events_db() as db:
        assert await db.scalar(select(func.count()).select_from(Admission)) == 0
