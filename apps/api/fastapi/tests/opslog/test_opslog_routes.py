"""Operations log routes (issue #1874): rules, isolation, private entries, audit."""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import User
from src.opslog.models import OpsLogEntry
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    new_grant_id,
)
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/opslog/org"

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
    def __init__(self, org_id: str, owner: User, writer: User, plain: User) -> None:
        self.org_id = org_id
        self.owner = owner
        self.writer = writer
        self.plain = plain

    def h(self, user: User) -> dict[str, str]:
        return headers_for(user, self.org_id)


async def _world(db: AsyncSession, *, apps: tuple[str, ...] = ("opslog",)) -> World:
    owner = await make_user(db)
    writer = await make_user(db)
    plain = await make_user(db)
    org = await make_org(
        db,
        f"Airport {uuid.uuid4().hex[:6]}",
        members=(
            (owner, MembershipRole.OWNER),
            (writer, MembershipRole.MEMBER),
            (plain, MembershipRole.MEMBER),
        ),
        apps=apps,
    )
    if "opslog" in apps:
        await _grant(db, org.id, writer, "opslog-writer")
    return World(org.id, owner, writer, plain)


async def _log(
    client: httpx.AsyncClient, world: World, **body: object
) -> dict[str, object]:
    response = await client.post(
        f"{API}/logs",
        headers=world.h(world.owner),
        json={"name": f"Operations {uuid.uuid4().hex[:4]}", **body},
    )
    assert response.status_code == 201, response.text
    made: dict[str, object] = response.json()
    return made


async def _entry(
    client: httpx.AsyncClient, world: World, log_id: object, user: User, **body: object
) -> httpx.Response:
    return await client.post(
        f"{API}/logs/{log_id}/entries",
        headers=world.h(user),
        json={"text": "Runway 10 inspection complete", **body},
    )


async def test_writer_keeps_the_log_and_readers_filter_it(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    log = await _log(async_client, world)
    log_id = log["id"]

    parent = await async_client.post(
        f"{API}/logs/{log_id}/categories",
        headers=world.h(world.owner),
        json={"name": "Airside"},
    )
    assert parent.status_code == 201, parent.text
    child = await async_client.post(
        f"{API}/logs/{log_id}/categories",
        headers=world.h(world.owner),
        json={"name": "Runway", "parent_id": parent.json()["id"]},
    )
    assert child.json()["depth"] == 2

    first = await _entry(
        async_client,
        world,
        log_id,
        world.writer,
        category_id=child.json()["id"],
        occurred_at="2026-11-25T06:00:00Z",
    )
    assert first.status_code == 201, first.text
    assert first.json()["author_id"] == str(world.writer.id)
    second = await _entry(
        async_client,
        world,
        log_id,
        world.writer,
        text="Fuel truck parked at stand 3",
        occurred_at="2026-11-25T07:00:00Z",
    )
    assert second.status_code == 201

    # A member with no opslog role reads nothing and writes nothing.
    assert (
        await async_client.get(f"{API}/logs", headers=world.h(world.plain))
    ).status_code == 403
    assert (await _entry(async_client, world, log_id, world.plain)).status_code == 403
    # A writer cannot set up logs.
    assert (
        await async_client.post(
            f"{API}/logs", headers=world.h(world.writer), json={"name": "Mine"}
        )
    ).status_code == 403

    listed = await async_client.get(
        f"{API}/logs/{log_id}/entries", headers=world.h(world.writer)
    )
    assert [e["id"] for e in listed.json()["data"]] == [
        second.json()["id"],
        first.json()["id"],
    ]
    by_parent = await async_client.get(
        f"{API}/logs/{log_id}/entries",
        headers=world.h(world.writer),
        params={"category_id": parent.json()["id"]},
    )
    assert [e["id"] for e in by_parent.json()["data"]] == [first.json()["id"]]
    by_text = await async_client.get(
        f"{API}/logs/{log_id}/entries",
        headers=world.h(world.writer),
        params={"q": "FUEL"},
    )
    assert [e["id"] for e in by_text.json()["data"]] == [second.json()["id"]]
    wildcard = await async_client.get(
        f"{API}/logs/{log_id}/entries",
        headers=world.h(world.writer),
        params={"q": "%"},
    )
    assert wildcard.json()["data"] == []
    window = await async_client.get(
        f"{API}/logs/{log_id}/entries",
        headers=world.h(world.writer),
        params={
            "occurred_from": "2026-11-25T06:30:00Z",
            "occurred_to": "2026-11-25T08:00:00Z",
        },
    )
    assert [e["id"] for e in window.json()["data"]] == [second.json()["id"]]

    page = await async_client.get(
        f"{API}/logs/{log_id}/entries",
        headers=world.h(world.writer),
        params={"limit": 1},
    )
    assert page.json()["next_cursor"]
    rest = await async_client.get(
        f"{API}/logs/{log_id}/entries",
        headers=world.h(world.writer),
        params={"limit": 1, "cursor": page.json()["next_cursor"]},
    )
    assert [e["id"] for e in rest.json()["data"]] == [first.json()["id"]]
    assert rest.json()["next_cursor"] is None
    bad = await async_client.get(
        f"{API}/logs/{log_id}/entries",
        headers=world.h(world.writer),
        params={"cursor": "not-a-cursor"},
    )
    assert bad.status_code == 422


async def test_categories_stop_at_three_levels_and_names_are_unique(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    log_id = (await _log(async_client, world))["id"]
    parent_id = None
    for name in ("One", "Two", "Three"):
        made = await async_client.post(
            f"{API}/logs/{log_id}/categories",
            headers=world.h(world.owner),
            json={"name": name, "parent_id": parent_id},
        )
        assert made.status_code == 201, made.text
        parent_id = made.json()["id"]
    too_deep = await async_client.post(
        f"{API}/logs/{log_id}/categories",
        headers=world.h(world.owner),
        json={"name": "Four", "parent_id": parent_id},
    )
    assert too_deep.status_code == 422
    duplicate = await async_client.post(
        f"{API}/logs/{log_id}/categories",
        headers=world.h(world.owner),
        json={"name": "one"},
    )
    assert duplicate.status_code == 409
    same_log_name = await async_client.post(
        f"{API}/logs", headers=world.h(world.owner), json={"name": "Duty"}
    )
    assert same_log_name.status_code == 201
    clash = await async_client.post(
        f"{API}/logs", headers=world.h(world.owner), json={"name": "DUTY"}
    )
    assert clash.status_code == 409


async def test_edit_rules_and_history_keep_the_earlier_text(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    log_id = (await _log(async_client, world, edit_window_minutes=30))["id"]
    entry = (await _entry(async_client, world, log_id, world.writer)).json()

    # Only the author edits.
    other = await async_client.patch(
        f"{API}/entries/{entry['id']}",
        headers=world.h(world.owner),
        json={"text": "Changed by someone else"},
    )
    assert other.status_code == 403
    edited = await async_client.patch(
        f"{API}/entries/{entry['id']}",
        headers=world.h(world.writer),
        json={"text": "Runway 10 inspection complete, two lights out"},
    )
    assert edited.status_code == 200, edited.text
    assert edited.json()["edited_at"] is not None

    changes = [
        change
        for row in await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.record_type == "opslog_entry",
                AuditEntry.record_id == entry["id"],
                AuditEntry.action == "update",
            )
        )
        for change in row.changes
        if change["field"] == "text"
    ]
    assert changes
    assert changes[0]["old"] == "Runway 10 inspection complete"

    # Past the edit window the entry is fixed.
    stored = await db_async.get(OpsLogEntry, entry["id"])
    assert stored is not None
    stored.created_at = utc_now() - timedelta(minutes=31)
    await db_async.commit()
    late = await async_client.patch(
        f"{API}/entries/{entry['id']}",
        headers=world.h(world.writer),
        json={"text": "Too late"},
    )
    assert late.status_code == 409

    # Append only: no edits, comments allowed.
    await async_client.patch(
        f"{API}/logs/{log_id}",
        headers=world.h(world.owner),
        json={"edit_rule": "append_only", "edit_window_minutes": None},
    )
    assert (
        await async_client.patch(
            f"{API}/entries/{entry['id']}",
            headers=world.h(world.writer),
            json={"text": "x"},
        )
    ).status_code == 409
    comment = await async_client.post(
        f"{API}/entries/{entry['id']}/comments",
        headers=world.h(world.writer),
        json={"text": "Electrician called"},
    )
    assert comment.status_code == 201, comment.text
    detail = await async_client.get(
        f"{API}/entries/{entry['id']}", headers=world.h(world.writer)
    )
    assert detail.json()["comment_count"] == 1
    assert [c["text"] for c in detail.json()["comments"]] == ["Electrician called"]

    # Locked: no comments either. Archived: no new entries.
    await async_client.patch(
        f"{API}/logs/{log_id}",
        headers=world.h(world.owner),
        json={"edit_rule": "locked"},
    )
    assert (
        await async_client.post(
            f"{API}/entries/{entry['id']}/comments",
            headers=world.h(world.writer),
            json={"text": "more"},
        )
    ).status_code == 409
    await async_client.patch(
        f"{API}/logs/{log_id}", headers=world.h(world.owner), json={"archived": True}
    )
    assert (await _entry(async_client, world, log_id, world.writer)).status_code == 409


async def test_private_entries_are_hidden_from_writers(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async)
    log_id = (await _log(async_client, world))["id"]
    refused = await _entry(async_client, world, log_id, world.writer, private=True)
    assert refused.status_code == 403
    private = await _entry(
        async_client, world, log_id, world.owner, text="Staff matter", private=True
    )
    assert private.status_code == 201
    public = await _entry(async_client, world, log_id, world.writer)

    seen = await async_client.get(
        f"{API}/logs/{log_id}/entries", headers=world.h(world.writer)
    )
    assert [e["id"] for e in seen.json()["data"]] == [public.json()["id"]]
    assert (
        await async_client.get(
            f"{API}/entries/{private.json()['id']}", headers=world.h(world.writer)
        )
    ).status_code == 404
    assert (
        await async_client.post(
            f"{API}/entries/{private.json()['id']}/comments",
            headers=world.h(world.writer),
            json={"text": "?"},
        )
    ).status_code == 404

    await _grant(db_async, world.org_id, world.writer, "opslog-supervisor")
    seen = await async_client.get(
        f"{API}/logs/{log_id}/entries", headers=world.h(world.writer)
    )
    assert len(seen.json()["data"]) == 2


async def test_other_organisations_and_superusers_are_refused(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    a = await _world(db_async)
    b = await _world(db_async)
    log_a = (await _log(async_client, a))["id"]
    entry_a = (await _entry(async_client, a, log_a, a.writer)).json()["id"]

    # B's owner, acting for B, cannot reach A's records.
    for method, path, body in (
        ("GET", f"/logs/{log_a}/entries", None),
        ("POST", f"/logs/{log_a}/entries", {"text": "x"}),
        ("PATCH", f"/logs/{log_a}", {"name": "x"}),
        ("GET", f"/logs/{log_a}/categories", None),
        ("GET", f"/entries/{entry_a}", None),
        ("POST", f"/entries/{entry_a}/comments", {"text": "x"}),
    ):
        response = await async_client.request(
            method, f"{API}{path}", headers=b.h(b.owner), json=body
        )
        assert response.status_code == 404, (method, path)
    # Claiming A's organisation without membership: 404 too.
    assert (
        await async_client.get(f"{API}/logs", headers=headers_for(b.owner, a.org_id))
    ).status_code == 404
    # A superuser with no membership is refused like anyone else.
    superuser = await make_user(db_async, superuser=True)
    assert (
        await async_client.get(f"{API}/logs", headers=headers_for(superuser, a.org_id))
    ).status_code == 404


async def test_entitlement_is_required(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    world = await _world(db_async, apps=())
    response = await async_client.get(f"{API}/logs", headers=world.h(world.owner))
    assert response.status_code == 403
