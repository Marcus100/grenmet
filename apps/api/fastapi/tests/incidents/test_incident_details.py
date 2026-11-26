"""Incidents slice 2 (#1876): persons, damage, resources and the manager alert."""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import User
from src.notifications.models import Notification
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    new_grant_id,
)
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/incidents/org"

pytestmark = pytest.mark.asyncio


async def _grant(db: AsyncSession, org_id: str, user: User, role_key: str) -> None:
    membership = await db.scalar(
        select(Membership).where(
            Membership.organisation_id == org_id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    db.add(
        MembershipGrant(
            id=new_grant_id(),
            membership_id=membership.id,
            organisation_id=org_id,
            role_key=role_key,
            granted_at=utc_now(),
        )
    )
    await db.commit()


async def _org(db: AsyncSession) -> tuple[str, User, User, User]:
    users = [await make_user(db) for _ in range(3)]
    org = await make_org(
        db,
        f"Airport {uuid.uuid4().hex[:6]}",
        members=(
            (users[0], MembershipRole.OWNER),
            (users[1], MembershipRole.MEMBER),
            (users[2], MembershipRole.MEMBER),
        ),
        apps=("incidents",),
    )
    await _grant(db, org.id, users[1], "incidents-responder")
    await _grant(db, org.id, users[2], "incidents-manager")
    return org.id, users[0], users[1], users[2]


async def test_persons_contact_details_are_private_and_corrections_audited(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org_id, owner, responder, _ = await _org(db_async)
    r = headers_for(responder, org_id)
    incident = (
        await async_client.post(f"{API}/incidents", headers=r, json={"title": "Slip"})
    ).json()
    base = f"{API}/incidents/{incident['id']}"
    made = await async_client.post(
        f"{base}/parties",
        headers=r,
        json={
            "kind": "involved",
            "name": "Ann Example",
            "affiliation": "passenger",
            "contact_phone": "+1 473 555 0100",
            "contact_email": "ann@example.com",
            "injured": True,
            "injury_notes": "Grazed knee",
        },
    )
    assert made.status_code == 201, made.text
    party = made.json()
    # The responder holds no private key: contact and injury notes are hidden.
    assert party["contact_phone"] is None
    assert party["injury_notes"] is None
    assert party["injured"] is True

    seen_by_owner = await async_client.get(base, headers=headers_for(owner, org_id))
    [full] = seen_by_owner.json()["parties"]
    assert full["contact_email"] == "ann@example.com"
    assert full["injury_notes"] == "Grazed knee"

    fixed = await async_client.patch(
        f"{base}/parties/{party['id']}", headers=r, json={"name": "Anne Example"}
    )
    assert fixed.status_code == 200
    changes = [
        change
        for row in await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.record_type == "incident_party",
                AuditEntry.record_id == party["id"],
                AuditEntry.action == "update",
            )
        )
        for change in row.changes
        if change["field"] == "name"
    ]
    assert changes[0]["old"] == "Ann Example"
    blank = await async_client.patch(
        f"{base}/parties/{party['id']}", headers=r, json={"name": "  "}
    )
    assert blank.status_code == 422
    missing = await async_client.patch(
        f"{base}/parties/inp_nothere", headers=r, json={"name": "x"}
    )
    assert missing.status_code == 404


async def test_damage_resources_and_the_lock(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org_id, owner, responder, _ = await _org(db_async)
    r = headers_for(responder, org_id)
    incident = (
        await async_client.post(
            f"{API}/incidents", headers=r, json={"title": "Tug hit jet bridge"}
        )
    ).json()
    base = f"{API}/incidents/{incident['id']}"
    damage = await async_client.post(
        f"{base}/damage",
        headers=r,
        json={
            "item": "Stand 3 jet bridge",
            "description": "Dented cab",
            "estimated_cost_minor": 250000,
        },
    )
    assert damage.status_code == 201, damage.text
    assert damage.json()["currency"] == "XCD"
    backwards = await async_client.post(
        f"{base}/resources",
        headers=r,
        json={
            "name": "Fire tender 1",
            "started_at": "2026-11-26T10:00:00Z",
            "ended_at": "2026-11-26T09:00:00Z",
        },
    )
    assert backwards.status_code == 422
    resource = await async_client.post(
        f"{base}/resources",
        headers=r,
        json={"name": "Fire tender 1", "started_at": "2026-11-26T10:00:00Z"},
    )
    assert resource.status_code == 201, resource.text
    detail = (await async_client.get(base, headers=r)).json()
    assert [d["item"] for d in detail["damage"]] == ["Stand 3 jet bridge"]
    assert [x["name"] for x in detail["resources"]] == ["Fire tender 1"]

    o = headers_for(owner, org_id)
    await async_client.post(f"{base}/open", headers=o)
    await async_client.post(f"{base}/close", headers=o)
    for path, body in (
        ("/damage", {"description": "late"}),
        ("/resources", {"name": "late"}),
        ("/parties", {"kind": "witness", "name": "late"}),
    ):
        response = await async_client.post(f"{base}{path}", headers=r, json=body)
        assert response.status_code == 409, path


async def test_opening_alerts_the_category_manager(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org_id, _, responder, manager = await _org(db_async)
    category = await async_client.post(
        f"{API}/categories",
        headers=headers_for(manager, org_id),
        json={"name": "Ramp", "manager_user_id": str(manager.id)},
    )
    incident = (
        await async_client.post(
            f"{API}/incidents",
            headers=headers_for(responder, org_id),
            json={
                "title": "Fuel spill",
                "category_id": category.json()["id"],
                "location": "stand 3",
            },
        )
    ).json()
    await async_client.post(
        f"{API}/incidents/{incident['id']}/open", headers=headers_for(responder, org_id)
    )
    [alert] = (
        await db_async.scalars(
            select(Notification).where(
                Notification.recipient_user_id == manager.id,
                Notification.entity_id == incident["id"],
            )
        )
    ).all()
    assert alert.event_key == "incidents.opened"
    assert incident["reference"] in alert.title
    assert "stand 3" in alert.body
    # The responder who opened it is not alerted.
    mine = await db_async.scalar(
        select(Notification.id).where(
            Notification.recipient_user_id == responder.id,
            Notification.entity_id == incident["id"],
        )
    )
    assert mine is None


async def test_reopen_alert_and_who_is_not_alerted(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org_id, owner, responder, manager = await _org(db_async)
    m = headers_for(manager, org_id)
    category = await async_client.post(
        f"{API}/categories",
        headers=m,
        json={"name": "Apron", "manager_user_id": str(manager.id)},
    )
    # The manager opens it themselves: no alert to the person who caused it.
    incident = (
        await async_client.post(
            f"{API}/incidents",
            headers=m,
            json={"title": "FOD on taxiway", "category_id": category.json()["id"]},
        )
    ).json()
    base = f"{API}/incidents/{incident['id']}"
    await async_client.post(f"{base}/open", headers=m)
    await async_client.post(f"{base}/close", headers=m)

    async def alerts(user: User) -> list[str]:
        return list(
            (
                await db_async.scalars(
                    select(Notification.event_key).where(
                        Notification.recipient_user_id == user.id,
                        Notification.entity_id == incident["id"],
                    )
                )
            ).all()
        )

    assert await alerts(manager) == []
    # The owner reopens: the manager hears, without the free-text reason.
    await async_client.post(
        f"{base}/reopen",
        headers=headers_for(owner, org_id),
        json={"reason": "Private detail about a person"},
    )
    assert await alerts(manager) == ["incidents.reopened"]
    body = await db_async.scalar(
        select(Notification.body).where(
            Notification.recipient_user_id == manager.id,
            Notification.entity_id == incident["id"],
        )
    )
    assert body is not None and "Private detail" not in body
    assert await alerts(responder) == []


async def test_parties_stay_in_their_incident_and_null_clears(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    org_id, owner, responder, _ = await _org(db_async)
    other_org, other_owner, _, _ = await _org(db_async)
    o = headers_for(owner, org_id)
    first = (
        await async_client.post(f"{API}/incidents", headers=o, json={"title": "A"})
    ).json()
    second = (
        await async_client.post(f"{API}/incidents", headers=o, json={"title": "B"})
    ).json()
    party = (
        await async_client.post(
            f"{API}/incidents/{first['id']}/parties",
            headers=o,
            json={"kind": "witness", "name": "Bo", "company": "Ground handler"},
        )
    ).json()
    wrong_incident = await async_client.patch(
        f"{API}/incidents/{second['id']}/parties/{party['id']}",
        headers=o,
        json={"name": "x"},
    )
    assert wrong_incident.status_code == 404
    other = await async_client.patch(
        f"{API}/incidents/{first['id']}/parties/{party['id']}",
        headers=headers_for(other_owner, other_org),
        json={"name": "x"},
    )
    assert other.status_code == 404
    cleared = await async_client.patch(
        f"{API}/incidents/{first['id']}/parties/{party['id']}",
        headers=o,
        json={"company": None},
    )
    assert cleared.json()["company"] is None
    assert cleared.json()["name"] == "Bo"
    # A responder without the private key never sees the statement.
    await async_client.patch(
        f"{API}/incidents/{first['id']}/parties/{party['id']}",
        headers=o,
        json={"statement": "I saw it"},
    )
    seen = await async_client.get(
        f"{API}/incidents/{first['id']}", headers=headers_for(responder, org_id)
    )
    assert seen.json()["parties"][0]["statement"] is None
