"""Control plane writes (C2): create, edit, suspend, verify, app entitlements, roster."""

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import User
from src.organisations import verification
from src.organisations.models import MembershipRole, PlatformOrganisation
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

URL = "/api/v1/organisations"
DECISION = {"reason": "Checked registration papers"}


@pytest.fixture(autouse=True)
def _fresh_verification_cache() -> None:
    verification.clear_cache()


async def _actors(db: AsyncSession) -> tuple[User, User, PlatformOrganisation]:
    admin = await make_user(db, superuser=True)
    owner = await make_user(db)
    org = await make_org(db, "Write Co", members=((owner, MembershipRole.OWNER),))
    return admin, owner, org


async def _entries(db: AsyncSession, org_id: str) -> list[AuditEntry]:
    return list(
        (
            await db.scalars(
                select(AuditEntry)
                .where(
                    AuditEntry.entity_type == "platform_organisation",
                    AuditEntry.entity_id == org_id,
                )
                .order_by(AuditEntry.created_at)
                .execution_options(populate_existing=True)
            )
        ).all()
    )


async def test_every_write_refuses_owners_and_anonymous(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    _, owner, org = await _actors(db_async)
    calls = [
        ("POST", URL, {"name": "X", "kind": "business"}),
        ("PATCH", f"{URL}/{org.id}", {"name": "Y"}),
        ("POST", f"{URL}/{org.id}/verify", DECISION),
        ("POST", f"{URL}/{org.id}/unverify", DECISION),
        ("PUT", f"{URL}/{org.id}/apps/events", {"enabled": True}),
        ("GET", f"{URL}/{org.id}/admin/members", None),
    ]
    for method, url, body in calls:
        anonymous = await async_client.request(method, url, json=body)
        assert anonymous.status_code == 401, (method, url)
        # An owner acts through OrgContext routes, never the control plane.
        as_owner = await async_client.request(
            method, url, json=body, headers=headers_for(owner, org.id)
        )
        assert as_owner.status_code == 403, (method, url)
    await db_async.refresh(org)
    assert org.name == "Write Co"
    assert org.verified_at is None


async def test_superuser_creates_each_kind_and_it_is_audited(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    admin = await make_user(db_async, superuser=True)
    for kind in ("barrels", "client", "business"):
        response = await async_client.post(
            URL,
            json={"name": f"Created {kind} Co", "kind": kind},
            headers=headers_for(admin),
        )
        assert response.status_code == 201, response.text
        body = response.json()
        assert body["kind"] == kind
        assert body["id"].startswith("org_")
        assert body["verified_at"] is None
        assert body["apps"] == []
    entries = await _entries(db_async, body["id"])
    assert [e.action for e in entries] == ["create"]
    assert entries[0].actor_user_id == admin.id


async def test_create_validates_slug_and_conflicts(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    admin, _, org = await _actors(db_async)
    headers = headers_for(admin)
    bad = await async_client.post(
        URL,
        json={"name": "A", "kind": "business", "slug": "Not A Slug"},
        headers=headers,
    )
    assert bad.status_code == 422
    taken = await async_client.post(
        URL, json={"name": "A", "kind": "business", "slug": org.slug}, headers=headers
    )
    assert taken.status_code == 409
    blank = await async_client.post(
        URL, json={"name": "   ", "kind": "business"}, headers=headers
    )
    assert blank.status_code == 422
    unknown_kind = await async_client.post(
        URL, json={"name": "A", "kind": "government"}, headers=headers
    )
    assert unknown_kind.status_code == 422


async def test_edit_changes_fields_and_audits_the_diff(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    admin, _, org = await _actors(db_async)
    response = await async_client.patch(
        f"{URL}/{org.id}",
        json={"name": " Renamed Co ", "slug": "renamed-co-x", "kind": "client"},
        headers=headers_for(admin),
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert (body["name"], body["slug"], body["kind"]) == (
        "Renamed Co",
        "renamed-co-x",
        "client",
    )
    updates = [e for e in await _entries(db_async, org.id) if e.action == "update"]
    assert updates
    assert updates[-1].actor_user_id == admin.id
    fields = {c["field"] for c in updates[-1].changes}
    assert {"name", "slug", "kind"} <= fields


async def test_edit_rejects_empty_duplicate_and_unknown(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    admin, _, org = await _actors(db_async)
    other = await make_org(db_async, "Other Write Co")
    headers = headers_for(admin)
    assert (
        await async_client.patch(f"{URL}/{org.id}", json={}, headers=headers)
    ).status_code == 422
    assert (
        await async_client.patch(
            f"{URL}/{org.id}", json={"slug": other.slug}, headers=headers
        )
    ).status_code == 409
    assert (
        await async_client.patch(
            f"{URL}/{org.id}", json={"status": "deleted"}, headers=headers
        )
    ).status_code == 422
    assert (
        await async_client.patch(
            f"{URL}/org_missing", json={"name": "Z"}, headers=headers
        )
    ).status_code == 404


async def test_suspend_blocks_org_context_and_reactivate_restores_it(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    admin, owner, org = await _actors(db_async)
    current = f"{URL}/current"
    assert (
        await async_client.get(current, headers=headers_for(owner, org.id))
    ).status_code == 200

    suspended = await async_client.patch(
        f"{URL}/{org.id}", json={"status": "suspended"}, headers=headers_for(admin)
    )
    assert suspended.status_code == 200
    assert suspended.json()["status"] == "suspended"
    blocked = await async_client.get(current, headers=headers_for(owner, org.id))
    assert blocked.status_code == 403
    assert "suspended" in blocked.json()["detail"]

    restored = await async_client.patch(
        f"{URL}/{org.id}", json={"status": "active"}, headers=headers_for(admin)
    )
    assert restored.json()["status"] == "active"
    assert (
        await async_client.get(current, headers=headers_for(owner, org.id))
    ).status_code == 200


async def test_verify_and_unverify_need_a_reason_and_record_it(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    admin, _, org = await _actors(db_async)
    headers = headers_for(admin)
    assert (
        await async_client.post(f"{URL}/{org.id}/verify", json={}, headers=headers)
    ).status_code == 422
    assert (
        await async_client.post(
            f"{URL}/{org.id}/verify", json={"reason": "   "}, headers=headers
        )
    ).status_code == 422
    assert (
        await async_client.post(
            f"{URL}/{org.id}/unverify", json=DECISION, headers=headers
        )
    ).status_code == 409

    verified = await async_client.post(
        f"{URL}/{org.id}/verify", json=DECISION, headers=headers
    )
    assert verified.status_code == 200, verified.text
    assert verified.json()["verified_at"] is not None
    assert (
        await async_client.post(
            f"{URL}/{org.id}/verify", json=DECISION, headers=headers
        )
    ).status_code == 409

    cleared = await async_client.post(
        f"{URL}/{org.id}/unverify",
        json={"reason": "Registration lapsed"},
        headers=headers,
    )
    assert cleared.status_code == 200
    assert cleared.json()["verified_at"] is None
    assert (
        await async_client.post(
            f"{URL}/org_missing/verify", json=DECISION, headers=headers
        )
    ).status_code == 404

    decisions = [
        e
        for e in await _entries(db_async, org.id)
        if e.action in {"verify", "unverify"}
    ]
    assert [e.action for e in decisions] == ["verify", "unverify"]
    assert decisions[0].changes[0]["new"] == DECISION["reason"]
    assert decisions[1].changes[0]["new"] == "Registration lapsed"
    assert all(e.actor_user_id == admin.id for e in decisions)

    history = await async_client.get(
        f"/api/v1/audit/platform_organisation/{org.id}", headers=headers
    )
    assert history.status_code == 200
    assert {"verify", "unverify"} <= {row["action"] for row in history.json()["data"]}


async def test_app_entitlements_toggle_audit_and_reject_unknown_apps(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    admin, _, org = await _actors(db_async)
    headers = headers_for(admin)
    on = await async_client.put(
        f"{URL}/{org.id}/apps/events", json={"enabled": True}, headers=headers
    )
    assert on.status_code == 200, on.text
    assert on.json()["apps"] == [{"app_key": "events", "enabled": True}]
    off = await async_client.put(
        f"{URL}/{org.id}/apps/events", json={"enabled": False}, headers=headers
    )
    assert off.json()["apps"] == [{"app_key": "events", "enabled": False}]

    unknown = await async_client.put(
        f"{URL}/{org.id}/apps/not-an-app", json={"enabled": True}, headers=headers
    )
    assert unknown.status_code == 422
    missing = await async_client.put(
        f"{URL}/org_missing/apps/events", json={"enabled": True}, headers=headers
    )
    assert missing.status_code == 404

    entries = [
        e
        for e in await _entries(db_async, org.id)
        if e.record_type == "organisation_app"
    ]
    assert [e.action for e in entries] == ["create", "update"]
    assert all(e.actor_user_id == admin.id for e in entries)


async def test_superuser_lists_members_of_any_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    admin, owner, org = await _actors(db_async)
    response = await async_client.get(
        f"{URL}/{org.id}/admin/members", headers=headers_for(admin)
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["count"] == 1
    assert body["data"][0]["email"] == owner.email
    assert body["data"][0]["role"] == "owner"
    assert (
        await async_client.get(
            f"{URL}/org_missing/admin/members", headers=headers_for(admin)
        )
    ).status_code == 404
