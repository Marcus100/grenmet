"""Settlement report (E4): arithmetic with deliberate mismatches, CSV, access."""

from datetime import timedelta
from typing import Any

import pytest
from sqlalchemy import update
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.events.models import Listing, OrganiserMember
from src.events.service.settlement import _cell
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
from tests.events.test_organiser_admin import _organiser
from tests.events.test_outlet import cash_event, open_till, outlet, sell

PAID = {"name": "General", "price_minor": 2500, "allocation": 20}
FREE = {"name": "Free", "price_minor": 0, "allocation": 10}


def report_url(event: dict[str, Any], tail: str = "") -> str:
    return f"{BASE}/manage/{event['listing']}/settlement{tail}"


async def second_staff(
    factory: SessionFactory, db_async: AsyncSession, event: dict[str, Any]
) -> User:
    staff = await user_with_role(db_async, "events-organiser")
    await profiles(factory, staff)
    async with factory() as db:
        listing = await db.get(Listing, event["listing"])
        assert listing is not None
        db.add(OrganiserMember(organiser_id=listing.organiser_id, user_id=staff.id))
        await db.commit()
    return staff


async def close(staff: User, event: dict[str, Any], counted: int) -> None:
    async with client_with_real_roles(staff) as client:
        response = await client.post(
            outlet(event, "/till/close"), json={"counted_minor": counted}
        )
    assert response.status_code == 200, response.text


@pytest.mark.asyncio
async def test_settlement_adds_up_and_lists_every_mismatch(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    # A free tier next to the paid one, for the online channel.
    async with client_with_real_roles(staff) as client:
        listing = (await client.get(f"{BASE}/manage")).json()["listings"][0]
        free_tier = {"name": "Free", "price_minor": 0, "allocation": 10}
        tiers = [
            {"id": listing["tiers"][0]["id"], **PAID},
            free_tier,
        ]
        body = {
            key: listing[key]
            for key in (
                "title",
                "summary",
                "category",
                "parish",
                "venue",
                "starts_at",
                "ends_at",
                "admission",
                "capacity",
                "status",
            )
        }
        updated = await client.put(
            f"{BASE}/manage/listings/{event['listing']}", json={**body, "tiers": tiers}
        )
        assert updated.status_code == 200, updated.text
    tier_ids = {row["name"]: row["id"] for row in updated.json()["tiers"]}
    other = await second_staff(events_db, db_async, event)
    third = await second_staff(events_db, db_async, event)

    # Online: three free claims, one cancelled by its holder.
    holders = [make_user("Ana"), make_user("Ben"), make_user("Cy")]
    claimed: list[str] = []
    for holder in holders:
        async with client_as(holder) as client:
            made = await client.post(
                f"{BASE}/listings/{event['slug']}/orders",
                json={"items": [{"tier_id": tier_ids["Free"], "quantity": 1}]},
            )
            assert made.status_code == 201, made.text
            claimed.append(made.json()["tickets"][0]["id"])
    async with client_as(holders[2]) as client:
        assert (
            await client.post(f"{BASE}/me/tickets/{claimed[2]}/cancel")
        ).status_code == 200

    # Outlet: staff sells 3 (float 100.00, takes 75.00, counts 165.00: short 10.00);
    # the other sells 1 (float 0, takes 25.00, counts 30.00: over 5.00); the
    # third opens a till and never closes it.
    await open_till(staff, event, 10000)
    first = await sell(staff, event, 2, 5000)
    assert first.status_code == 201
    assert (await sell(staff, event, 1, 2500)).status_code == 201
    await open_till(other, event, 0)
    assert (await sell(other, event, 1, 2500)).status_code == 201
    await open_till(third, event, 500)
    await close(staff, event, 16500)
    await close(other, event, 3000)
    async with events_db() as db:
        await db.execute(
            update(Listing)
            .where(Listing.id == event["listing"])
            .values(
                starts_at=utc_now() - timedelta(hours=5),
                ends_at=utc_now() - timedelta(minutes=5),
            )
        )
        await db.commit()

    # Admit one online and one outlet ticket.
    async with client_with_real_roles(staff) as client:
        outlet_ticket = first.json()["tickets"][0]["qr_token"]
        assert (
            await client.post(
                f"{BASE}/manage/{event['listing']}/admissions",
                json={"code": outlet_ticket},
            )
        ).status_code == 200
        online = (await client.get(f"{BASE}/manage/{event['listing']}/manifest")).json()
        online_code = next(
            row["code"] for row in online["rows"] if row["channel"] == "online"
        )
        assert (
            await client.post(
                f"{BASE}/manage/{event['listing']}/admissions",
                json={"code": online_code},
            )
        ).status_code == 200
        response = await client.get(report_url(event))
    assert response.status_code == 200, response.text
    report = response.json()

    by_channel = {row["channel"]: row for row in report["channels"]}
    online = by_channel["online"]
    assert (online["issued"], online["claimed"], online["cancelled"]) == (3, 2, 1)
    assert (online["admitted"], online["waiting"]) == (1, 1)
    assert online["collected_minor"] == 0
    outlet_row = by_channel["outlet_cash"]
    assert (outlet_row["issued"], outlet_row["claimed"]) == (4, 4)
    assert (outlet_row["admitted"], outlet_row["waiting"]) == (1, 3)
    assert outlet_row["collected_minor"] == 10000
    assert outlet_row["value_minor"] == 10000
    totals = report["totals"]
    assert (totals["issued"], totals["claimed"], totals["cancelled"]) == (7, 6, 1)
    assert (totals["admitted"], totals["waiting"]) == (2, 4)

    tiers_by_name = {row["name"]: row for row in report["tiers"]}
    assert tiers_by_name["General"]["outlet"] == 4
    assert tiers_by_name["General"]["remaining"] == 16
    assert tiers_by_name["Free"]["online"] == 2

    cash = report["cash"]
    assert cash["collected_minor"] == 10000
    assert cash["expected_minor"] == (10000 + 7500) + 2500 + 500
    assert (cash["open_tills"], cash["closed_tills"]) == (1, 2)
    kinds = sorted(issue["kind"] for issue in report["discrepancies"])
    assert kinds == ["till_open", "till_over", "till_short"]
    short = next(i for i in report["discrepancies"] if i["kind"] == "till_short")
    assert short["amount_minor"] == -1000
    over = next(i for i in report["discrepancies"] if i["kind"] == "till_over")
    assert over["amount_minor"] == 500
    assert cash["difference_minor"] == (16500 - 17500) + 500
    assert cash["counted_minor"] == 16500 + 3000


@pytest.mark.asyncio
async def test_a_balanced_till_raises_no_discrepancy(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    await open_till(staff, event, 10000)
    assert (await sell(staff, event, 2, 5000)).status_code == 201
    await close(staff, event, 15000)
    async with client_with_real_roles(staff) as client:
        report = (await client.get(report_url(event))).json()
        summary = (await client.get(f"{BASE}/manage/settlement")).json()
    assert report["discrepancies"] == []
    assert report["cash"]["difference_minor"] == 0
    assert report["tills"][0]["difference_minor"] == 0
    assert [row["listing_id"] for row in summary["listings"]] == [event["listing"]]
    assert summary["listings"][0]["issues"] == 0
    assert summary["listings"][0]["cash_counted_minor"] == 15000


@pytest.mark.asyncio
async def test_csv_export_matches_the_report_and_guards_formulas(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await cash_event(events_db, db_async)
    await open_till(staff, event, 0)
    assert (await sell(staff, event, 1, 2500)).status_code == 201
    async with client_with_real_roles(staff) as client:
        response = await client.get(report_url(event, ".csv"))
    assert response.status_code == 200
    assert response.headers["content-type"].startswith("text/csv")
    assert "attachment" in response.headers["content-disposition"]
    text = response.text
    assert "Tickets by channel" in text
    assert "outlet_cash,1,1,0,1,0,0,25.00,25.00,0.00" in text
    assert "Discrepancies" in text
    assert _cell("=HYPERLINK(1)") == "'=HYPERLINK(1)"
    assert _cell("Dana") == "Dana"


@pytest.mark.asyncio
async def test_settlement_is_for_the_organisers_own_staff_only(
    events_db: SessionFactory, db_async: AsyncSession
):
    _, event = await cash_event(events_db, db_async)
    plain = await user_with_role(db_async, "events-member")
    async with client_with_real_roles(plain) as client:
        assert (await client.get(report_url(event))).status_code == 403
        assert (await client.get(report_url(event, ".csv"))).status_code == 403
        assert (await client.get(f"{BASE}/manage/settlement")).status_code == 403
    other = await _organiser(events_db, db_async, "other-crew")
    async with client_with_real_roles(other) as client:
        assert (await client.get(report_url(event))).status_code == 404
        assert (await client.get(report_url(event, ".csv"))).status_code == 404
        mine = (await client.get(f"{BASE}/manage/settlement")).json()
    assert mine["listings"] == []
