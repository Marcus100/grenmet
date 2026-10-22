"""Organiser cancel, postpone and manual refund (E5)."""

import asyncio
import uuid
from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.events import outbox, schemas, service
from src.events.models import Activity, Listing, Refund, Ticket
from src.exceptions import AppException
from src.utils.datetime import utc_now
from tests.events.roles import user_with_role
from tests.events.support import (
    BASE,
    SessionFactory,
    as_row,
    client_as,
    client_with_real_roles,
    make_user,
    queued,
)
from tests.events.test_organiser_admin import _organiser
from tests.events.test_outlet import cash_event, open_till, outlet, sell
from tests.events.test_settlement import close, report_url

FREE = {"name": "Free", "price_minor": 0, "allocation": 6}


def manage(event: dict[str, Any], tail: str) -> str:
    return f"{BASE}/manage/{event['listing']}{tail}"


async def claim_online(event: dict[str, Any], name: str, quantity: int = 1):
    holder = make_user(name)
    async with client_as(holder) as client:
        response = await client.post(
            f"{BASE}/listings/{event['slug']}/orders",
            json={"items": [{"tier_id": event["tier"], "quantity": quantity}]},
        )
    assert response.status_code == 201, response.text
    return holder, response.json()["tickets"]


async def cancel(staff: User, event: dict[str, Any], confirm: bool = True):
    async with client_with_real_roles(staff) as client:
        return await client.post(manage(event, "/cancel"), json={"confirm": confirm})


async def refund(
    staff: User, event: dict[str, Any], ticket_id: str, amount: int, **extra: Any
):
    body = {"amount_minor": amount, "method": "cash", **extra}
    async with client_with_real_roles(staff) as client:
        return await client.post(
            manage(event, f"/tickets/{ticket_id}/refund"), json=body
        )


async def activity_actions(factory: SessionFactory) -> list[str]:
    async with factory() as db:
        return [
            row.action
            for row in (
                await db.scalars(select(Activity).order_by(Activity.created_at))
            ).all()
        ]


@pytest.mark.asyncio
async def test_cancelling_an_event_cancels_every_ticket_and_tells_holders(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async, FREE)
    ana, ana_tickets = await claim_online(event, "Ana", 2)
    await open_till(staff, event, 0)
    assert (await sell(staff, event, 2, 0)).status_code == 201

    response = await cancel(staff, event)
    assert response.status_code == 200, response.text
    assert response.json() == {
        "listing_id": event["listing"],
        "status": "cancelled",
        "tickets_cancelled": 4,
        "orders_refunded": 0,
        "orders_kept": 0,
        "refunds_failed": 0,
        "orders_released": 0,
    }
    async with events_db() as db:
        statuses = (await db.scalars(select(Ticket.status))).all()
        listing = await db.get(Listing, event["listing"])
        rows = await queued(events_db, outbox.CANCELLED)
        assert listing is not None
        assert listing.status == "cancelled"
        assert statuses.count("cancelled") == 4
        assert statuses.count("valid") == 0
        assert len(rows) == 1
        audience = await outbox._listing_audience(db, as_row(rows[0]), listing)
        assert ana.id in audience

    # Online holders see the cancellation; nobody can claim or sell any more.
    async with client_as(ana) as client:
        mine = (await client.get(f"{BASE}/me/tickets")).json()
        assert {row["status"] for row in mine} == {"cancelled"}
        again = await client.post(
            f"{BASE}/listings/{event['slug']}/orders",
            json={"items": [{"tier_id": event["tier"], "quantity": 1}]},
        )
        assert again.status_code == 404
    refused = await sell(staff, event, 1, 0)
    assert refused.status_code == 409
    assert (await cancel(staff, event)).status_code == 409
    assert "listing.cancelled" in await activity_actions(events_db)
    async with events_db() as db:
        row = await db.scalar(
            select(Activity).where(Activity.action == "listing.cancelled")
        )
    assert row is not None
    assert row.summary["tickets_cancelled"] == 4
    assert ana_tickets


@pytest.mark.asyncio
async def test_saving_a_listing_as_cancelled_cancels_its_tickets_too(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async, FREE)
    await claim_online(event, "Zed")
    async with client_with_real_roles(staff) as client:
        listing = (await client.get(f"{BASE}/manage")).json()["listings"][0]
        keys = (
            "title",
            "summary",
            "category",
            "parish",
            "venue",
            "starts_at",
            "ends_at",
            "admission",
            "capacity",
        )
        body = {key: listing[key] for key in keys} | {
            "status": "cancelled",
            "tiers": [{"id": listing["tiers"][0]["id"], **FREE}],
        }
        saved = await client.put(
            f"{BASE}/manage/listings/{event['listing']}", json=body
        )
        assert saved.status_code == 200, saved.text
    async with events_db() as db:
        assert (
            await db.scalar(
                select(func.count()).select_from(Ticket).where(Ticket.status == "valid")
            )
            == 0
        )


@pytest.mark.asyncio
async def test_cancel_needs_confirmation_a_published_event_and_the_right_organiser(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async, FREE)
    assert (await cancel(staff, event, confirm=False)).status_code == 422
    plain = await user_with_role(db_async, "events-member")
    assert (await cancel(plain, event)).status_code == 403
    other = await _organiser(events_db, db_async, "other-crew")
    assert (await cancel(other, event)).status_code == 404
    async with events_db() as db:
        listing = await db.get(Listing, event["listing"])
        assert listing is not None
        assert listing.status == "published"


@pytest.mark.asyncio
async def test_postponing_keeps_tickets_valid_and_notifies_holders(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async, FREE)
    holder, _ = await claim_online(event, "Pia")
    start = (utc_now() + timedelta(days=20)).replace(microsecond=0)
    body = {
        "starts_at": f"{start.isoformat()}Z",
        "ends_at": f"{(start + timedelta(hours=4)).isoformat()}Z",
    }
    async with client_with_real_roles(staff) as client:
        response = await client.post(manage(event, "/postpone"), json=body)
        assert response.status_code == 200, response.text
        assert response.json()["starts_at"] == body["starts_at"]
        # Same time again, past times and backwards times are refused.
        assert (
            await client.post(manage(event, "/postpone"), json=body)
        ).status_code == 409
        past = {
            "starts_at": f"{(utc_now() - timedelta(days=1)).isoformat()}Z",
            "ends_at": body["ends_at"],
        }
        assert (
            await client.post(manage(event, "/postpone"), json=past)
        ).status_code == 409
        backwards = {"starts_at": body["ends_at"], "ends_at": body["starts_at"]}
        assert (
            await client.post(manage(event, "/postpone"), json=backwards)
        ).status_code == 409
    async with events_db() as db:
        listing = await db.get(Listing, event["listing"])
        assert listing is not None
        assert listing.starts_at == start
        assert listing.status == "published"
        valid = await db.scalar(
            select(func.count()).select_from(Ticket).where(Ticket.status == "valid")
        )
        rows = await queued(events_db, outbox.POSTPONED)
        assert valid == 1
        assert len(rows) == 1
        assert holder.id in await outbox._listing_audience(db, as_row(rows[0]), listing)
    assert "listing.rescheduled" in await activity_actions(events_db)


@pytest.mark.asyncio
async def test_a_cash_refund_comes_off_the_till_and_blocks_admission(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    await open_till(staff, event, 10000)
    sale = (await sell(staff, event, 2, 5000)).json()
    first, second = sale["tickets"]
    assert first["can_refund"] is True

    # Over the ticket price, and a bank refund without a reference, are refused.
    assert (await refund(staff, event, first["id"], 2501)).status_code == 409
    assert (
        await refund(staff, event, first["id"], 2500, method="bank")
    ).status_code == 409

    done = await refund(staff, event, first["id"], 2500, reference="  till 1  ")
    assert done.status_code == 201, done.text
    body = done.json()
    assert (body["method"], body["amount_minor"]) == ("cash", 2500)
    assert body["reference"] == "till 1"
    assert body["code"] == first["code"]
    assert (await refund(staff, event, first["id"], 2500)).status_code == 409

    async with client_with_real_roles(staff) as client:
        scan = await client.post(
            manage(event, "/admissions"), json={"code": first["qr_token"]}
        )
        assert scan.status_code == 409
        assert "refunded" in scan.json()["detail"]
        assert (
            await client.post(
                manage(event, "/admissions"), json={"code": second["qr_token"]}
            )
        ).status_code == 200
        screen = (await client.get(outlet(event))).json()
    refunded = next(
        row for row in screen["sales"][0]["tickets"] if row["id"] == first["id"]
    )
    assert refunded["status"] == "refunded"
    assert refunded["can_refund"] is False
    assert refunded["refund"]["amount_minor"] == 2500
    # The seat is back on sale; the used ticket cannot be refunded.
    assert screen["tiers"][0]["sold"] == 1
    assert (await refund(staff, event, second["id"], 2500)).status_code == 409

    # Till: float 100.00 + 50.00 sold - 25.00 refunded = 125.00 expected.
    assert screen["till"]["cash_refunds_minor"] == 2500
    assert screen["till"]["expected_minor"] == 12500
    await close(staff, event, 12000)
    async with client_with_real_roles(staff) as client:
        report = (await client.get(report_url(event))).json()
    outlet_row = next(r for r in report["channels"] if r["channel"] == "outlet_cash")
    assert (outlet_row["refunded"], outlet_row["refunded_minor"]) == (1, 2500)
    assert report["cash"]["cash_refunds_minor"] == 2500
    assert report["cash"]["net_sales_minor"] == 2500
    assert report["cash"]["expected_minor"] == 12500
    assert report["cash"]["difference_minor"] == -500
    assert [row["amount_minor"] for row in report["refunds"]] == [2500]
    assert [i["kind"] for i in report["discrepancies"]] == ["till_short"]

    async with events_db() as db:
        rows = (
            await db.scalars(
                select(Activity).where(Activity.action == "ticket.refunded")
            )
        ).all()
        stored = (await db.scalars(select(Refund))).all()
    assert len(rows) == 1
    assert rows[0].actor_id == staff.id
    assert "till 1" not in str(rows[0].summary)
    assert [row.refunded_by for row in stored] == [staff.id]


@pytest.mark.asyncio
async def test_refund_rules_for_online_free_and_cancelled_event_tickets(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async, FREE)
    _, online = await claim_online(event, "Ola")
    await open_till(staff, event, 0)
    free_sale = (await sell(staff, event, 1, 0)).json()["tickets"][0]
    online_try = await refund(staff, event, online[0]["id"], 100)
    assert online_try.status_code == 409
    assert "Only outlet cash" in online_try.json()["detail"]
    assert (await refund(staff, event, free_sale["id"], 100)).status_code == 409
    assert (
        await refund(
            staff,
            event,
            "00000000-0000-0000-0000-000000000000",
            100,
        )
    ).status_code == 404


@pytest.mark.asyncio
async def test_cancelled_event_tickets_can_be_refunded_even_if_used_and_loose_cash_is_flagged(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    await open_till(staff, event, 0)
    sale = (await sell(staff, event, 2, 5000)).json()
    used, unused = sale["tickets"]
    async with client_with_real_roles(staff) as client:
        assert (
            await client.post(
                manage(event, "/admissions"), json={"code": used["qr_token"]}
            )
        ).status_code == 200
    assert (await cancel(staff, event)).json()["tickets_cancelled"] == 2
    await close(staff, event, 5000)

    # Refunded after the till closed: cash goes out with no open till (flagged);
    # bank refunds are not.
    cash = await refund(staff, event, used["id"], 2500)
    bank = await refund(
        staff, event, unused["id"], 2500, method="bank", reference="TX-1"
    )
    assert (cash.status_code, bank.status_code) == (201, 201)
    assert cash.json()["till_session_id"] is None
    async with client_with_real_roles(staff) as client:
        report = (await client.get(report_url(event))).json()
    kinds = sorted(issue["kind"] for issue in report["discrepancies"])
    assert kinds == ["refund_without_till"]
    assert report["cash"]["cash_refunds_minor"] == 2500
    outlet_row = next(r for r in report["channels"] if r["channel"] == "outlet_cash")
    assert outlet_row["refunded_minor"] == 5000
    assert outlet_row["refunded"] == 2
    async with client_with_real_roles(staff) as client:
        csv_text = (await client.get(report_url(event, ".csv"))).text
    assert "Refunds" in csv_text
    assert "TX-1" in csv_text


@pytest.mark.asyncio
async def test_refunds_need_organiser_admin_staff_of_that_event(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    await open_till(staff, event, 0)
    ticket = (await sell(staff, event, 1, 2500)).json()["tickets"][0]
    plain = await user_with_role(db_async, "events-member")
    assert (await refund(plain, event, ticket["id"], 2500)).status_code == 403
    other = await _organiser(events_db, db_async, "other-crew")
    assert (await refund(other, event, ticket["id"], 2500)).status_code == 404
    async with events_db() as db:
        assert await db.scalar(select(func.count()).select_from(Refund)) == 0


@pytest.mark.asyncio
async def test_claims_racing_a_cancellation_never_leave_a_valid_ticket(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async, FREE)

    async def claim(index: int):
        async with events_db() as db:
            return await service.claim_tickets(
                db,
                make_user(f"Racer{index}"),
                event["slug"],
                schemas.OrderCreate.model_validate(
                    {"items": [{"tier_id": event["tier"], "quantity": 1}]}
                ),
            )

    async def cancel_now():
        async with events_db() as db:
            return await service.cancel_event(
                db, staff, uuid.UUID(event["listing"]), []
            )

    results = await asyncio.gather(
        *(claim(index) for index in range(5)), cancel_now(), return_exceptions=True
    )
    assert not [
        row
        for row in results
        if isinstance(row, Exception) and not isinstance(row, AppException)
    ]
    async with events_db() as db:
        valid = await db.scalar(
            select(func.count()).select_from(Ticket).where(Ticket.status == "valid")
        )
    assert valid == 0
