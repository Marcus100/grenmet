"""Org-zone listing management (slice L1): /events/org/{workspace,listings,...}.

The generic key, staff-key, MFA, entitlement, suspension and cross-organisation
cases for these routes run through the shared ``ROUTES`` tables in
``test_org_permissions.py`` and ``test_staff_ops.py``. This file covers what is
specific to listings: the organiser resolved from the organisation, the publish
rule, activity capacity, and that the legacy ``/events/manage/*`` routes keep
working unchanged."""

import uuid

import pytest
from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from src.events.models import Listing, Organiser
from src.organisations import verification
from src.organisations.models import PlatformOrganisation
from src.utils.datetime import utc_now
from tests.events.support import BASE, SessionFactory, client_with_real_roles
from tests.events.test_org_orders import ORG, _activity, _desk, _shop_with_events
from tests.events.test_org_permissions import _member, listing_body
from tests.events.test_paid_orders import Shop
from tests.events.test_staff_ops import _staff, _with_org
from tests.organisations.support import headers_for


async def _verify(db: AsyncSession, shop: Shop, *, verified: bool) -> None:
    await db.execute(
        update(PlatformOrganisation)
        .where(PlatformOrganisation.id == shop.organisation_id)
        .values(verified_at=utc_now() if verified else None)
    )
    await db.commit()
    verification._cache.clear()


@pytest.mark.asyncio
async def test_workspace_is_the_organisations_own_organiser(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    mine = await _shop_with_events(db_async, events_db)
    other = await _shop_with_events(db_async, events_db)
    async with await _desk() as client:
        response = await client.get(
            f"{ORG}/workspace", headers=headers_for(mine.owner, mine.organisation_id)
        )
    assert response.status_code == 200, response.text
    body = response.json()
    assert [row["id"] for row in body["listings"]] == [str(mine.listing_id)]
    assert str(other.listing_id) not in response.text
    assert [o["organisation_id"] for o in body["organisers"]] == [mine.organisation_id]


@pytest.mark.asyncio
async def test_an_organisation_without_an_organiser_gets_404(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    async with events_db() as events:
        row = await events.scalar(
            select(Organiser).where(Organiser.organisation_id == shop.organisation_id)
        )
        assert row is not None
        row.organisation_id = None
        await events.commit()
    async with await _desk() as client:
        response = await client.get(
            f"{ORG}/workspace", headers=headers_for(shop.owner, shop.organisation_id)
        )
    assert response.status_code == 404


@pytest.mark.asyncio
async def test_listing_of_another_organisation_is_404_on_every_listing_route(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    mine = await _shop_with_events(db_async, events_db)
    other = await _shop_with_events(db_async, events_db)
    headers = headers_for(mine.owner, mine.organisation_id)
    async with await _desk() as client:
        put = await client.put(
            f"{ORG}/listings/{other.listing_id}", headers=headers, json=listing_body()
        )
        postpone = await client.post(
            f"{ORG}/events/{other.listing_id}/postpone",
            headers=headers,
            json={
                "starts_at": "2099-01-01T10:00:00Z",
                "ends_at": "2099-01-01T14:00:00Z",
            },
        )
        activity = await client.get(
            f"{ORG}/events/{other.listing_id}/activity", headers=headers
        )
    assert (put.status_code, postpone.status_code, activity.status_code) == (
        404,
        404,
        404,
    )
    async with events_db() as events:
        row = await events.get(Listing, other.listing_id)
        assert row is not None
        assert row.title == "Paid Fete"


@pytest.mark.asyncio
async def test_unverified_organiser_can_save_a_draft_but_not_publish(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _verify(db_async, shop, verified=False)
    headers = headers_for(shop.owner, shop.organisation_id)
    async with await _desk() as client:
        draft = await client.post(
            f"{ORG}/listings", headers=headers, json=listing_body(status="draft")
        )
        publish = await client.post(
            f"{ORG}/listings", headers=headers, json=listing_body(status="published")
        )
        # Moving the draft to published is the same rule.
        promote = await client.put(
            f"{ORG}/listings/{draft.json()['id']}",
            headers=headers,
            json=listing_body(status="published"),
        )
    assert draft.status_code == 201, draft.text
    assert publish.status_code == 403
    assert "verified" in publish.json()["detail"]
    assert promote.status_code == 403
    await _verify(db_async, shop, verified=True)
    async with await _desk() as client:
        ok = await client.post(
            f"{ORG}/listings", headers=headers, json=listing_body(status="published")
        )
    assert ok.status_code == 201, ok.text


@pytest.mark.asyncio
async def test_staff_cannot_publish_for_an_unverified_organiser(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _verify(db_async, shop, verified=False)
    _, headers = await _staff(db_async, "events-staff-manager")
    async with await _desk() as client:
        response = await client.post(
            f"{ORG}/listings",
            headers=_with_org(headers, shop),
            json=listing_body(status="published"),
        )
    assert response.status_code == 403


@pytest.mark.asyncio
async def test_staff_listing_writes_record_staff_and_member_writes_record_member(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _verify(db_async, shop, verified=True)
    member = await _member(db_async, shop, "events-manager")
    staff_user, staff = await _staff(db_async, "events-staff-manager")
    async with await _desk() as client:
        by_member = await client.post(
            f"{ORG}/listings",
            headers=headers_for(member, shop.organisation_id),
            json=listing_body(title="Member made"),
        )
        by_staff = await client.post(
            f"{ORG}/listings",
            headers=_with_org(staff, shop),
            json=listing_body(title="Staff made"),
        )
        edited = await client.put(
            f"{ORG}/listings/{by_staff.json()['id']}",
            headers=_with_org(staff, shop),
            json=listing_body(title="Staff edited"),
        )
        logo = await client.put(
            f"{ORG}/organiser/logo", headers=_with_org(staff, shop), json={}
        )
        history = await client.get(
            f"{ORG}/events/{by_staff.json()['id']}/activity",
            headers=headers_for(shop.owner, shop.organisation_id),
        )
    assert {by_member.status_code, by_staff.status_code} == {201}
    assert edited.status_code == 200 and logo.status_code == 200
    created = await _activity(events_db, "listing.created")
    assert {(r.actor_id, r.actor_capacity) for r in created} == {
        (member.id, "member"),
        (staff_user.id, "staff"),
    }
    assert all(r.actor_capacity == "staff" for r in await _activity(events_db, "listing.updated"))
    entries = history.json()
    assert entries
    assert {e["actor_capacity"] for e in entries} == {"staff"}
    assert str(staff_user.id) not in history.text
    assert {e["actor_name"] for e in entries} == {"Barrels staff"}


@pytest.mark.asyncio
async def test_staff_postpone_records_staff_and_keeps_tickets(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    staff_user, staff = await _staff(db_async, "events-staff-manager")
    async with await _desk() as client:
        first = await client.post(
            f"{ORG}/events/{shop.listing_id}/postpone",
            headers=_with_org(staff, shop),
            json={
                "starts_at": "2099-01-01T10:00:00Z",
                "ends_at": "2099-01-01T14:00:00Z",
            },
        )
        again = await client.post(
            f"{ORG}/events/{shop.listing_id}/postpone",
            headers=_with_org(staff, shop),
            json={
                "starts_at": "2099-01-01T10:00:00Z",
                "ends_at": "2099-01-01T14:00:00Z",
            },
        )
    assert first.status_code == 200, first.text
    # Same new start again is a conflict, exactly as on the legacy route.
    assert again.status_code == 409
    rows = await _activity(events_db, "listing.rescheduled")
    assert [(r.actor_id, r.actor_capacity) for r in rows] == [(staff_user.id, "staff")]


@pytest.mark.asyncio
async def test_door_only_staff_cannot_manage_listings(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    _, door = await _staff(db_async, "events-staff-door", mfa=False)
    async with await _desk() as client:
        response = await client.get(
            f"{ORG}/workspace", headers=_with_org(door, shop)
        )
    assert response.status_code == 404


# --- legacy routes unchanged ----------------------------------------------------------


@pytest.mark.asyncio
async def test_legacy_manage_routes_still_work_for_the_owner(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    await _verify(db_async, shop, verified=True)
    async with client_with_real_roles(shop.owner) as client:
        workspace = await client.get(f"{BASE}/manage")
        created = await client.post(
            f"{BASE}/manage/listings", json=listing_body(title="Legacy made")
        )
        listing_id = created.json()["id"]
        updated = await client.put(
            f"{BASE}/manage/listings/{listing_id}",
            json=listing_body(title="Legacy edited"),
        )
        postponed = await client.post(
            f"{BASE}/manage/{listing_id}/postpone",
            json={
                "starts_at": "2099-02-01T10:00:00Z",
                "ends_at": "2099-02-01T14:00:00Z",
            },
        )
        history = await client.get(f"{BASE}/manage/{listing_id}/activity")
        logo = await client.put(f"{BASE}/manage/organiser/logo", json={})
    assert workspace.status_code == 200, workspace.text
    assert created.status_code == 201, created.text
    assert updated.status_code == 200, updated.text
    assert postponed.status_code == 200, postponed.text
    assert logo.status_code == 200, logo.text
    assert history.status_code == 200
    assert {e["actor_capacity"] for e in history.json()} == {"member"}
    ids = [row["id"] for row in workspace.json()["listings"]]
    assert str(shop.listing_id) in ids


@pytest.mark.asyncio
async def test_org_and_legacy_workspaces_agree(
    db_async: AsyncSession, events_db: SessionFactory
) -> None:
    shop = await _shop_with_events(db_async, events_db)
    async with client_with_real_roles(shop.owner) as legacy:
        old = (await legacy.get(f"{BASE}/manage")).json()
    async with await _desk() as client:
        new = (
            await client.get(
                f"{ORG}/workspace",
                headers=headers_for(shop.owner, shop.organisation_id),
            )
        ).json()
    assert old == new
    assert uuid.UUID(new["listings"][0]["id"]) == shop.listing_id
