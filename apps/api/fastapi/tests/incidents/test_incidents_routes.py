"""Incidents routes (issue #1876): lifecycle, lock, checklists, notes, isolation."""

import uuid

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src import outbox
from src.audit.models import AuditEntry
from src.auth.models import User
from src.opslog.models import OpsLog, OpsLogEntry

# Importing the handler module registers the operations log handler.
from src.opslog.outbox_handlers import ENTRY_POST_TOPIC
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


class World:
    def __init__(
        self, org_id: str, owner: User, responder: User, manager: User, plain: User
    ) -> None:
        self.org_id = org_id
        self.owner = owner
        self.responder = responder
        self.manager = manager
        self.plain = plain

    def h(self, user: User) -> dict[str, str]:
        return headers_for(user, self.org_id)


async def _world(db: AsyncSession, *, apps: tuple[str, ...] = ("incidents",)) -> World:
    users = [await make_user(db) for _ in range(4)]
    org = await make_org(
        db,
        f"Airport {uuid.uuid4().hex[:6]}",
        members=(
            (users[0], MembershipRole.OWNER),
            (users[1], MembershipRole.MEMBER),
            (users[2], MembershipRole.MEMBER),
            (users[3], MembershipRole.MEMBER),
        ),
        apps=apps,
    )
    if "incidents" in apps:
        await _grant(db, org.id, users[1], "incidents-responder")
        await _grant(db, org.id, users[2], "incidents-manager")
    return World(org.id, *users)


async def _category(
    client: httpx.AsyncClient, world: World, *, required: bool = True
) -> str:
    made = await client.post(
        f"{API}/categories",
        headers=world.h(world.manager),
        json={"name": f"Fuel spill {uuid.uuid4().hex[:4]}"},
    )
    assert made.status_code == 201, made.text
    category_id: str = made.json()["id"]
    item = await client.post(
        f"{API}/categories/{category_id}/checklist-items",
        headers=world.h(world.manager),
        json={"label": "Fire service called", "required": required},
    )
    assert item.status_code == 201, item.text
    return category_id


async def _report(
    client: httpx.AsyncClient, world: World, user: User, **body: object
) -> dict[str, object]:
    made = await client.post(
        f"{API}/incidents",
        headers=world.h(user),
        json={"title": "Fuel spill at stand 3", **body},
    )
    assert made.status_code == 201, made.text
    incident: dict[str, object] = made.json()
    return incident


async def test_lifecycle_checklist_lock_and_reopen(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    category_id = await _category(async_client, world)
    first = await _report(async_client, world, world.responder, category_id=category_id)
    second = await _report(async_client, world, world.responder)
    year = utc_now().year
    assert first["status"] == "draft"
    assert first["reference"] == f"INC-{year}-0001"
    assert second["reference"] == f"INC-{year}-0002"
    incident = f"{API}/incidents/{first['id']}"

    opened = await async_client.post(
        f"{incident}/open", headers=world.h(world.responder)
    )
    assert opened.status_code == 200, opened.text
    body = opened.json()
    assert body["status"] == "open"
    assert [c["label"] for c in body["checks"]] == ["Fire service called"]
    assert [t["kind"] for t in body["timeline"]] == ["opened"]
    again = await async_client.post(
        f"{incident}/open", headers=world.h(world.responder)
    )
    assert again.status_code == 409
    moved = await async_client.patch(
        incident, headers=world.h(world.responder), json={"category_id": None}
    )
    assert moved.status_code == 409

    action = await async_client.post(
        f"{incident}/timeline",
        headers=world.h(world.responder),
        json={"text": "Absorbent laid"},
    )
    assert action.status_code == 201, action.text

    # Responders cannot close; a required check blocks the manager.
    assert (
        await async_client.post(f"{incident}/close", headers=world.h(world.responder))
    ).status_code == 403
    blocked = await async_client.post(
        f"{incident}/close", headers=world.h(world.manager)
    )
    assert blocked.status_code == 409
    check_id = body["checks"][0]["id"]
    ticked = await async_client.patch(
        f"{incident}/checks/{check_id}",
        headers=world.h(world.responder),
        json={"done": True},
    )
    assert ticked.json()["done_by"] == str(world.responder.id)
    closed = await async_client.post(
        f"{incident}/close", headers=world.h(world.manager)
    )
    assert closed.status_code == 200, closed.text
    assert closed.json()["closed_by"] == str(world.manager.id)

    # Closed means locked.
    for method, path, payload in (
        ("PATCH", "", {"title": "Changed"}),
        ("POST", "/timeline", {"text": "Late action"}),
        ("POST", "/notes", {"text": "Late note"}),
        ("PATCH", f"/checks/{check_id}", {"done": False}),
    ):
        response = await async_client.request(
            method, f"{incident}{path}", headers=world.h(world.manager), json=payload
        )
        assert response.status_code == 409, (method, path)

    assert (
        await async_client.post(
            f"{incident}/reopen",
            headers=world.h(world.responder),
            json={"reason": "More to add"},
        )
    ).status_code == 403
    reopened = await async_client.post(
        f"{incident}/reopen",
        headers=world.h(world.manager),
        json={"reason": "Witness statement arrived"},
    )
    assert reopened.status_code == 200, reopened.text
    detail = reopened.json()
    assert detail["status"] == "open"
    assert detail["closed_at"] is None
    assert [t["kind"] for t in detail["timeline"]] == [
        "opened",
        "action",
        "closed",
        "reopened",
    ]
    assert "Witness statement arrived" in detail["timeline"][-1]["text"]

    edited = await async_client.patch(
        incident,
        headers=world.h(world.responder),
        json={"title": "Fuel spill, stand 3"},
    )
    assert edited.status_code == 200
    changes = [
        change
        for row in await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.record_type == "incident",
                AuditEntry.record_id == first["id"],
                AuditEntry.action == "update",
            )
        )
        for change in row.changes
        if change["field"] == "title"
    ]
    assert changes[0]["old"] == "Fuel spill at stand 3"


async def test_status_changes_post_to_the_operations_log(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async, apps=("incidents", "opslog"))
    log = OpsLog(organisation_id=world.org_id, name="Operations")
    db_async.add(log)
    await db_async.commit()
    incident = await _report(async_client, world, world.responder, exercise=True)
    await async_client.post(
        f"{API}/incidents/{incident['id']}/open", headers=world.h(world.responder)
    )
    await outbox.drain(db_async, only_topics=[ENTRY_POST_TOPIC])
    [entry] = (
        await db_async.scalars(
            select(OpsLogEntry).where(OpsLogEntry.organisation_id == world.org_id)
        )
    ).all()
    assert (entry.source_kind, entry.source_id) == (
        "incidents.incident",
        incident["id"],
    )
    assert entry.text.startswith("Exercise: Incident INC-")


async def test_private_notes_and_categories(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    incident = await _report(async_client, world, world.responder)
    notes = f"{API}/incidents/{incident['id']}/notes"
    assert (
        await async_client.post(
            notes, headers=world.h(world.responder), json={"text": "x", "private": True}
        )
    ).status_code == 403
    await async_client.post(
        notes,
        headers=world.h(world.manager),
        json={"text": "Staff member involved", "private": True},
    )
    await async_client.post(
        notes, headers=world.h(world.responder), json={"text": "Photos taken"}
    )
    seen = await async_client.get(
        f"{API}/incidents/{incident['id']}", headers=world.h(world.responder)
    )
    assert [n["text"] for n in seen.json()["notes"]] == ["Photos taken"]
    seen = await async_client.get(
        f"{API}/incidents/{incident['id']}", headers=world.h(world.manager)
    )
    assert len(seen.json()["notes"]) == 2

    outsider = await make_user(db_async)
    not_member = await async_client.post(
        f"{API}/categories",
        headers=world.h(world.manager),
        json={"name": "Security", "manager_user_id": str(outsider.id)},
    )
    assert not_member.status_code == 422
    ok = await async_client.post(
        f"{API}/categories",
        headers=world.h(world.manager),
        json={"name": "Security", "manager_user_id": str(world.manager.id)},
    )
    assert ok.status_code == 201
    clash = await async_client.post(
        f"{API}/categories", headers=world.h(world.manager), json={"name": "SECURITY"}
    )
    assert clash.status_code == 409
    assert (
        await async_client.post(
            f"{API}/categories", headers=world.h(world.responder), json={"name": "x"}
        )
    ).status_code == 403

    listed = await async_client.get(
        f"{API}/incidents",
        headers=world.h(world.responder),
        params={"q": str(incident["reference"]).lower()},
    )
    assert [i["id"] for i in listed.json()["data"]] == [incident["id"]]


async def test_other_organisations_superusers_and_entitlement(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    a = await _world(db_async)
    b = await _world(db_async)
    incident = await _report(async_client, a, a.responder)
    path = f"{API}/incidents/{incident['id']}"
    for method, suffix, body in (
        ("GET", "", None),
        ("PATCH", "", {"title": "x"}),
        ("POST", "/open", None),
        ("POST", "/timeline", {"text": "x"}),
        ("POST", "/notes", {"text": "x"}),
    ):
        response = await async_client.request(
            method, f"{path}{suffix}", headers=b.h(b.owner), json=body
        )
        assert response.status_code == 404, (method, suffix)
    listing = await async_client.get(f"{API}/incidents", headers=b.h(b.owner))
    assert listing.json()["data"] == []
    assert (
        await async_client.get(
            f"{API}/incidents", headers=headers_for(b.owner, a.org_id)
        )
    ).status_code == 404
    superuser = await make_user(db_async, superuser=True)
    assert (
        await async_client.get(
            f"{API}/incidents", headers=headers_for(superuser, a.org_id)
        )
    ).status_code == 404
    assert (
        await async_client.get(f"{API}/incidents", headers=a.h(a.plain))
    ).status_code == 403

    unentitled = await _world(db_async, apps=())
    assert (
        await async_client.get(
            f"{API}/incidents", headers=unentitled.h(unentitled.owner)
        )
    ).status_code == 403
