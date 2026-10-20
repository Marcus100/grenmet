"""Public sites (ADR-0025 N1/N2): control-plane writes, public and org reads."""

import uuid

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.organisations import service, sites
from src.organisations.config import organisations_settings
from src.organisations.models import (
    MembershipRole,
    OrganisationStatus,
    PlatformOrganisation,
    PublicSite,
)
from src.utils import secret_box
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

URL = "/api/v1/organisations"


@pytest.fixture
def secret_keys(monkeypatch: pytest.MonkeyPatch) -> list[str]:
    keys = [Fernet.generate_key().decode()]
    monkeypatch.setattr(organisations_settings, "ORG_SECRET_ENCRYPTION_KEYS", keys)
    return keys


def _key() -> str:
    return f"site-{uuid.uuid4().hex[:8]}"


async def _create(
    client: httpx.AsyncClient, headers: dict[str, str], org_id: str, **extra: object
) -> httpx.Response:
    body = {"organisation_id": org_id, "key": _key(), "name": "Shop", **extra}
    return await client.post(f"{URL}/admin/sites", headers=headers, json=body)


async def test_control_plane_creates_and_never_returns_the_secret(
    async_client: httpx.AsyncClient, db_async: AsyncSession, secret_keys: list[str]
) -> None:
    admin = await make_user(db_async, superuser=True)
    org = await make_org(db_async, "Site Co")
    resp = await _create(
        async_client,
        headers_for(admin),
        org.id,
        site_url="https://shop.example.com",
        contact_recipient="Inbox@Example.com",
        accepts_contact=True,
        turnstile_mode="enforce",
        turnstile_site_key="0x-public",
        turnstile_secret="0x-very-secret",
    )
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["turnstile_secret_set"] is True
    assert "0x-very-secret" not in resp.text
    assert "turnstile_secret" not in body

    row = await db_async.get(PublicSite, body["id"])
    assert row is not None and row.turnstile_secret_encrypted is not None
    assert secret_box.decrypt(row.turnstile_secret_encrypted, secret_keys) == (
        "0x-very-secret"
    )
    resolved = await sites.resolve_public_site(db_async, body["key"])
    assert resolved is not None
    assert resolved.turnstile.mode == "enforce"
    assert resolved.turnstile.secret == "0x-very-secret"

    entries = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.record_type == "organisation_public_site",
                AuditEntry.record_id == body["id"],
            )
        )
    ).all()
    assert entries, "site writes are audited"
    assert all("turnstile_secret_encrypted" not in (e.changes or {}) for e in entries)

    listed = await async_client.get(
        f"{URL}/admin/sites",
        headers=headers_for(admin),
        params={"organisation_id": org.id},
    )
    assert [s["key"] for s in listed.json()["data"]] == [body["key"]]
    assert "0x-very-secret" not in listed.text


async def test_patch_changes_only_sent_fields_and_null_clears_the_secret(
    async_client: httpx.AsyncClient, db_async: AsyncSession, secret_keys: list[str]
) -> None:
    _ = secret_keys
    admin = await make_user(db_async, superuser=True)
    org = await make_org(db_async, "Patch Co")
    created = (
        await _create(
            async_client, headers_for(admin), org.id, turnstile_secret="first"
        )
    ).json()
    url = f"{URL}/admin/sites/{created['id']}"

    renamed = await async_client.patch(
        url, headers=headers_for(admin), json={"name": "Renamed"}
    )
    assert renamed.status_code == 200
    assert renamed.json()["name"] == "Renamed"
    assert renamed.json()["turnstile_secret_set"] is True

    cleared = await async_client.patch(
        url, headers=headers_for(admin), json={"turnstile_secret": None}
    )
    assert cleared.json()["turnstile_secret_set"] is False
    empty = await async_client.patch(url, headers=headers_for(admin), json={})
    assert empty.status_code == 422


async def test_duplicate_key_unknown_org_and_missing_keys(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin = await make_user(db_async, superuser=True)
    org = await make_org(db_async, "Dup Co")
    key = _key()
    first = await async_client.post(
        f"{URL}/admin/sites",
        headers=headers_for(admin),
        json={"organisation_id": org.id, "key": key, "name": "A"},
    )
    assert first.status_code == 201
    again = await async_client.post(
        f"{URL}/admin/sites",
        headers=headers_for(admin),
        json={"organisation_id": org.id, "key": key, "name": "B"},
    )
    assert again.status_code == 409
    unknown = await _create(async_client, headers_for(admin), "org_missing")
    assert unknown.status_code == 404
    bad_key = await async_client.post(
        f"{URL}/admin/sites",
        headers=headers_for(admin),
        json={"organisation_id": org.id, "key": "Bad Key", "name": "C"},
    )
    assert bad_key.status_code == 422

    monkeypatch.setattr(organisations_settings, "ORG_SECRET_ENCRYPTION_KEYS", [])
    no_keys = await _create(
        async_client, headers_for(admin), org.id, turnstile_secret="x"
    )
    assert no_keys.status_code == 503


async def test_control_plane_refuses_owners_and_anonymous(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner = await make_user(db_async)
    org = await make_org(db_async, "Owner Co", members=((owner, MembershipRole.OWNER),))
    calls = [
        ("GET", f"{URL}/admin/sites", None),
        (
            "POST",
            f"{URL}/admin/sites",
            {"organisation_id": org.id, "key": _key(), "name": "X"},
        ),
        ("PATCH", f"{URL}/admin/sites/site_x", {"name": "Y"}),
    ]
    for method, url, body in calls:
        assert (await async_client.request(method, url, json=body)).status_code == 401
        as_owner = await async_client.request(
            method, url, json=body, headers=headers_for(owner, org.id)
        )
        assert as_owner.status_code == 403, (method, url)


async def test_public_read_hides_secrets_and_suspended_owners(
    async_client: httpx.AsyncClient, db_async: AsyncSession, secret_keys: list[str]
) -> None:
    _ = secret_keys
    admin = await make_user(db_async, superuser=True)
    org = await make_org(db_async, "Public Co")
    created = (
        await _create(
            async_client,
            headers_for(admin),
            org.id,
            accepts_subscriptions=True,
            turnstile_site_key="0x-public",
            turnstile_secret="0x-secret",
            contact_recipient="private@example.com",
        )
    ).json()

    resp = await async_client.get(f"{URL}/public/sites/{created['key']}")
    assert resp.status_code == 200
    assert resp.json() == {
        "key": created["key"],
        "name": "Shop",
        "accepts_contact": False,
        "accepts_subscriptions": True,
        "turnstile_site_key": "0x-public",
    }
    assert "0x-secret" not in resp.text and "private@" not in resp.text
    assert (await async_client.get(f"{URL}/public/sites/nope")).status_code == 404

    row = await db_async.get(PlatformOrganisation, org.id)
    assert row is not None
    row.status = OrganisationStatus.SUSPENDED.value
    await db_async.commit()
    gone = await async_client.get(f"{URL}/public/sites/{created['key']}")
    assert gone.status_code == 404


async def test_org_admins_list_only_their_own_sites(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin = await make_user(db_async, superuser=True)
    owner, member, rival = [await make_user(db_async) for _ in range(3)]
    org = await make_org(
        db_async,
        "Mine Co",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
    )
    other = await make_org(
        db_async, "Rival Co", members=((rival, MembershipRole.OWNER),)
    )
    mine = (await _create(async_client, headers_for(admin), org.id)).json()
    await _create(async_client, headers_for(admin), other.id)

    resp = await async_client.get(
        f"{URL}/org/sites", headers=headers_for(owner, org.id)
    )
    assert resp.status_code == 200
    assert [s["key"] for s in resp.json()["data"]] == [mine["key"]]
    denied = await async_client.get(
        f"{URL}/org/sites", headers=headers_for(member, org.id)
    )
    assert denied.status_code == 403
    outsider = await async_client.get(
        f"{URL}/org/sites", headers=headers_for(rival, org.id)
    )
    assert outsider.status_code == 404


async def test_default_sites_seed_is_idempotent(db_async: AsyncSession) -> None:
    await sites.ensure_default_public_sites(db_async)
    await sites.ensure_default_public_sites(db_async)
    await db_async.commit()
    barrels = await db_async.get(PlatformOrganisation, service.BARRELS_ORGANISATION_ID)
    assert barrels is not None and barrels.kind == "barrels"
    keys = {
        site.key: site.organisation_id
        for site in (await db_async.scalars(select(PublicSite))).all()
    }
    assert keys["barrels"] == "barrels"
    assert keys["signal"] == "barrels"
    if await db_async.get(PlatformOrganisation, "gaa") is not None:
        assert keys["mbia"] == "gaa"
        assert keys["gms-alerts"] == "gaa"
