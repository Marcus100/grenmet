"""Door admission (E2): idempotent scans, duplicate rejection, manifest, access."""

import asyncio
import re
from typing import Any

import pytest
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.events.models import Activity, Admission
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
from tests.events.test_tickets import _claim

FREE_TIER = {"name": "Free", "price_minor": 0, "allocation": 10}
DUPLICATE = re.compile(r"Already admitted at \d\d:\d\d by ")


async def _door(
    factory: SessionFactory, db_async: AsyncSession
) -> tuple[User, dict[str, Any]]:
    """A verified organiser (with a profile) and a published free-ticket event."""
    staff = await _organiser(factory, db_async)
    await profiles(factory, staff)
    async with client_with_real_roles(staff) as client:
        created = await client.post(MANAGE, json=_payload(tiers=[FREE_TIER]))
        assert created.status_code == 201, created.text
        listing = created.json()
    event = {
        "slug": listing["slug"],
        "tier": listing["tiers"][0]["id"],
        "listing": listing["id"],
    }
    return staff, event


async def _holder(
    factory: SessionFactory, event: dict[str, Any], name: str, quantity: int = 1
) -> tuple[User, list[dict[str, Any]]]:
    holder = make_user(name)
    await profiles(factory, holder)
    response = await _claim(holder, event, quantity)
    assert response.status_code == 201, response.text
    return holder, response.json()["tickets"]


async def _qr(holder: User, ticket_id: str) -> str:
    async with client_as(holder) as client:
        return (await client.get(f"{BASE}/me/tickets/{ticket_id}")).json()["qr_token"]


def _admissions(event: dict[str, Any]) -> str:
    return f"{BASE}/manage/{event['listing']}/admissions"


def _scan(code: str, key: str | None = None) -> dict[str, Any]:
    return {"code": code, **({"idempotency_key": key} if key else {})}


@pytest.mark.asyncio
async def test_scanning_admits_once_and_names_who_let_them_in(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await _door(events_db, db_async)
    ana, ana_tickets = await _holder(events_db, event, "Ana", 2)
    token = await _qr(ana, ana_tickets[0]["id"])

    async with client_with_real_roles(staff) as client:
        first = await client.post(_admissions(event), json=_scan(token, "scan-1"))
        assert first.status_code == 200, first.text
        body = first.json()
        assert body["holder_name"] == "Ana Tester"
        assert body["tier_name"] == "Free"
        assert body["repeat"] is False
        assert body["admitted_by_name"] == staff.full_name.strip()

        # The same scan retried replays its own success...
        replay = await client.post(_admissions(event), json=_scan(token, "scan-1"))
        assert replay.status_code == 200
        assert replay.json()["repeat"] is True
        assert replay.json()["admitted_at"] == body["admitted_at"]

        # ...but any other second scan is a duplicate, by token or typed code.
        again = await client.post(_admissions(event), json=_scan(token, "scan-2"))
        assert again.status_code == 409
        assert DUPLICATE.search(again.json()["detail"])
        assert body["admitted_by_name"] in again.json()["detail"]
        typed = await client.post(
            _admissions(event), json=_scan(ana_tickets[0]["code"].lower())
        )
        assert typed.status_code == 409

        # A different ticket (typed with the printed code) is admitted.
        other = await client.post(
            _admissions(event), json=_scan(ana_tickets[1]["code"])
        )
        assert other.status_code == 200
        assert other.json()["code"] == ana_tickets[1]["code"]

    async with events_db() as db:
        assert await db.scalar(select(func.count()).select_from(Admission)) == 2
        rows = (
            await db.scalars(
                select(Activity).where(Activity.action == "ticket.admitted")
            )
        ).all()
    assert len(rows) == 2
    assert {row.actor_id for row in rows} == {staff.id}
    assert all("Ana" not in str(row.summary) for row in rows)

    async with client_as(ana) as client:
        mine = (await client.get(f"{BASE}/me/tickets")).json()
    assert all(row["admitted_at"] and not row["can_cancel"] for row in mine)


@pytest.mark.asyncio
async def test_concurrent_scans_of_one_ticket_admit_it_once(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await _door(events_db, db_async)
    _, issued = await _holder(events_db, event, "Race")

    async def scan(key: str):
        async with client_with_real_roles(staff) as client:
            return await client.post(
                _admissions(event), json=_scan(issued[0]["code"], key)
            )

    results = await asyncio.gather(*(scan(f"door-{index}") for index in range(4)))
    assert sorted(response.status_code for response in results) == [200, 409, 409, 409]
    async with events_db() as db:
        assert await db.scalar(select(func.count()).select_from(Admission)) == 1


@pytest.mark.asyncio
async def test_bad_scans_are_refused(events_db: SessionFactory, db_async: AsyncSession):
    staff, event = await _door(events_db, db_async)
    other_staff = await _organiser(events_db, db_async, slug="other-crew")
    async with client_with_real_roles(other_staff) as client:
        elsewhere = await client.post(MANAGE, json=_payload(tiers=[FREE_TIER]))
    other_event = {
        "slug": elsewhere.json()["slug"],
        "tier": elsewhere.json()["tiers"][0]["id"],
        "listing": elsewhere.json()["id"],
    }
    holder, mine = await _holder(events_db, event, "Cancel", 2)
    _, theirs = await _holder(events_db, other_event, "Other")
    async with client_as(holder) as client:
        cancelled = await client.post(f"{BASE}/me/tickets/{mine[1]['id']}/cancel")
        assert cancelled.status_code == 200

    async with client_with_real_roles(staff) as client:
        scan = _admissions(event)
        assert (
            await client.post(scan, json=_scan(theirs[0]["code"]))
        ).status_code == 409  # another event's ticket
        refused = await client.post(scan, json=_scan(mine[1]["code"]))
        assert refused.status_code == 409
        assert "cancelled" in refused.json()["detail"]
        assert (await client.post(scan, json=_scan("ZZZZZ-ZZZZZ"))).status_code == 404
        assert (await client.post(scan, json=_scan("nope"))).status_code == 409
        forged = await client.post(scan, json=_scan(f"BT1.{'0' * 10}.{'A' * 16}"))
        assert forged.status_code == 409
    async with events_db() as db:
        assert await db.scalar(select(func.count()).select_from(Admission)) == 0


@pytest.mark.asyncio
async def test_manifest_matches_what_was_issued(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await _door(events_db, db_async)
    ana, ana_tickets = await _holder(events_db, event, "Ana", 2)
    _, ben_tickets = await _holder(events_db, event, "Ben")
    async with client_as(ana) as client:
        await client.post(f"{BASE}/me/tickets/{ana_tickets[1]['id']}/cancel")

    async with client_with_real_roles(staff) as client:
        manifest_url = f"{BASE}/manage/{event['listing']}/manifest"
        before = (await client.get(manifest_url)).json()
        assert (before["issued"], before["admitted"], before["waiting"]) == (2, 0, 2)
        assert before["cancelled"] == 1
        assert [row["holder_name"] for row in before["rows"]] == [
            "Ana Tester",
            "Ben Tester",
        ]
        assert {row["code"] for row in before["rows"]} == {
            ana_tickets[0]["code"],
            ben_tickets[0]["code"],
        }

        await client.post(_admissions(event), json=_scan(ben_tickets[0]["code"]))
        after = (await client.get(manifest_url)).json()
        assert (after["issued"], after["admitted"], after["waiting"]) == (2, 1, 1)
        ben_row = next(
            row for row in after["rows"] if row["holder_name"] == "Ben Tester"
        )
        assert ben_row["admitted_at"] is not None


@pytest.mark.asyncio
async def test_a_used_ticket_cannot_be_cancelled(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await _door(events_db, db_async)
    holder, issued = await _holder(events_db, event, "Used")
    async with client_with_real_roles(staff) as client:
        assert (
            await client.post(_admissions(event), json=_scan(issued[0]["code"]))
        ).status_code == 200
    async with client_as(holder) as client:
        refused = await client.post(f"{BASE}/me/tickets/{issued[0]['id']}/cancel")
        assert refused.status_code == 409
        assert "used" in refused.json()["detail"]


@pytest.mark.asyncio
async def test_only_the_events_organiser_staff_can_scan_or_list(
    events_db: SessionFactory, db_async: AsyncSession
):
    staff, event = await _door(events_db, db_async)
    _, issued = await _holder(events_db, event, "Guest")
    manifest_url = f"{BASE}/manage/{event['listing']}/manifest"
    scan = _scan(issued[0]["code"])

    plain_member = await user_with_role(db_async, "events-member")
    async with client_with_real_roles(plain_member) as client:
        assert (await client.post(_admissions(event), json=scan)).status_code == 403
        assert (await client.get(manifest_url)).status_code == 403

    # An organiser of another organiser can't see this event at all.
    rival = await _organiser(events_db, db_async, slug="rival-crew")
    async with client_with_real_roles(rival) as client:
        assert (await client.post(_admissions(event), json=scan)).status_code == 404
        assert (await client.get(manifest_url)).status_code == 404

    async with client_as(None) as client:
        assert (await client.post(_admissions(event), json=scan)).status_code in (
            401,
            403,
        )

    async with events_db() as db:
        assert await db.scalar(select(func.count()).select_from(Admission)) == 0
    async with client_with_real_roles(staff) as client:
        assert (await client.get(manifest_url)).status_code == 200
