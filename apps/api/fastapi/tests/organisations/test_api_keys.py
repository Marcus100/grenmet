"""Organisation API keys (ADR-0029, PF5): issue, authenticate, rotate, revoke."""

from collections.abc import AsyncGenerator
from datetime import timedelta
from typing import Annotated, Any

import httpx
import pytest
from fastapi import Depends, FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.dependencies import get_db
from src.exceptions import AppException
from src.organisations import api_key_scopes, api_keys, service
from src.organisations.api_key_auth import ApiKeyContext, require_api_key_scope
from src.organisations.models import ApiKey, MembershipRole, OrganisationStatus
from src.rate_limit import limiter
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

URL = "/api/v1/organisations"
INVALID = "Invalid or expired API key"


async def _setup(db: AsyncSession, apps: tuple[str, ...] = ("bookings",)):
    admin = await make_user(db)
    org = await make_org(
        db, "Keys Co", members=((admin, MembershipRole.ADMIN),), apps=apps
    )
    return admin, org


async def _create(
    client: httpx.AsyncClient,
    admin: Any,
    org: Any,
    *,
    scopes: list[str] | None = None,
    **extra: Any,
) -> httpx.Response:
    return await client.post(
        f"{URL}/org/api-keys",
        headers=headers_for(admin, org.id),
        json={"name": "Kiosk", "scopes": scopes or ["bookings.read"], **extra},
    )


def _bearer(secret: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {secret}"}


async def test_create_shows_secret_once_and_stores_only_the_hash(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async)
    resp = await _create(async_client, admin, org)
    assert resp.status_code == 201, resp.text
    body = resp.json()
    secret = body["secret"]
    assert secret.startswith(f"bk_{body['key_prefix']}_")
    assert len(body["key_prefix"]) == 8

    row = await db_async.get(ApiKey, body["id"])
    assert row is not None
    assert row.key_hash == api_keys.hash_secret(secret)
    assert secret not in (row.key_hash, row.key_prefix)
    assert row.scopes == ["bookings.read"]
    assert row.created_by_user_id == admin.id
    assert row.expires_at is not None
    ttl = row.expires_at - utc_now()
    assert timedelta(days=89) < ttl <= timedelta(days=90)

    listed = await async_client.get(
        f"{URL}/org/api-keys", headers=headers_for(admin, org.id)
    )
    assert listed.status_code == 200
    assert secret not in listed.text
    assert all("secret" not in item for item in listed.json()["data"])
    assert listed.json()["data"][0]["key_prefix"] == body["key_prefix"]


async def test_lifetime_is_capped_at_one_year(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async)
    assert (
        await _create(async_client, admin, org, expires_in_days=366)
    ).status_code == 422
    assert (
        await _create(async_client, admin, org, expires_in_days=365)
    ).status_code == 201


async def test_key_authenticates_key_info(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async)
    created = (await _create(async_client, admin, org)).json()
    resp = await async_client.get(
        f"{URL}/org/key-info", headers=_bearer(created["secret"])
    )
    assert resp.status_code == 200, resp.text
    assert resp.json() == {
        "organisation_id": org.id,
        "key_id": created["id"],
        "name": "Kiosk",
        "key_prefix": created["key_prefix"],
        "scopes": ["bookings.read"],
        "expires_at": created["expires_at"],
    }


async def test_user_token_is_not_an_api_key_and_the_reverse(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async)
    secret = (await _create(async_client, admin, org)).json()["secret"]

    jwt_resp = await async_client.get(
        f"{URL}/org/key-info", headers=headers_for(admin, org.id)
    )
    assert jwt_resp.status_code == 401
    assert jwt_resp.json()["detail"] == INVALID

    # A bk_ key is refused by the normal user dependencies.
    for path in ("/api/v1/auth/users/me", f"{URL}/mine"):
        resp = await async_client.get(path, headers=_bearer(secret))
        assert resp.status_code == 401, path
    resp = await async_client.get(
        f"{URL}/org/api-keys",
        headers={**_bearer(secret), "X-Barrels-Organisation": org.id},
    )
    assert resp.status_code == 401


async def test_unknown_expired_and_revoked_keys_share_one_401(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async)
    expired = (await _create(async_client, admin, org)).json()
    revoked = (await _create(async_client, admin, org)).json()
    row = await db_async.get(ApiKey, expired["id"])
    assert row is not None
    row.expires_at = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    revoke = await async_client.post(
        f"{URL}/org/api-keys/{revoked['id']}/revoke", headers=headers_for(admin, org.id)
    )
    assert revoke.status_code == 200
    assert revoke.json()["revoked_at"] is not None

    unknown = api_keys.new_secret().secret
    responses = []
    for credential in (
        unknown,
        expired["secret"],
        revoked["secret"],
        "bk_short",
        "bk_",
        "",
    ):
        headers = _bearer(credential) if credential else {}
        responses.append(await async_client.get(f"{URL}/org/key-info", headers=headers))
    assert [r.status_code for r in responses] == [401] * 6
    assert {r.json()["detail"] for r in responses[:-1]} == {INVALID}


async def test_suspended_organisation_key_is_403(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async)
    secret = (await _create(async_client, admin, org)).json()["secret"]
    org.status = OrganisationStatus.SUSPENDED.value
    await db_async.commit()
    resp = await async_client.get(f"{URL}/org/key-info", headers=_bearer(secret))
    assert resp.status_code == 403


async def test_last_used_is_throttled_to_once_a_minute(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async)
    created = (await _create(async_client, admin, org)).json()
    headers = _bearer(created["secret"])
    row = await db_async.get(ApiKey, created["id"])
    assert row is not None and row.last_used_at is None

    assert (
        await async_client.get(f"{URL}/org/key-info", headers=headers)
    ).status_code == 200
    await db_async.refresh(row)
    first = row.last_used_at
    assert first is not None

    assert (
        await async_client.get(f"{URL}/org/key-info", headers=headers)
    ).status_code == 200
    await db_async.refresh(row)
    assert row.last_used_at == first, "second call inside a minute does not write"

    row.last_used_at = utc_now() - timedelta(minutes=2)
    stale = row.last_used_at
    await db_async.commit()
    assert (
        await async_client.get(f"{URL}/org/key-info", headers=headers)
    ).status_code == 200
    await db_async.refresh(row)
    assert row.last_used_at is not None and row.last_used_at > stale

    # Use is not audited (it would flood history); creation is.
    actions = (
        await db_async.scalars(
            select(AuditEntry.action).where(
                AuditEntry.record_type == "organisation_api_key",
                AuditEntry.record_id == created["id"],
            )
        )
    ).all()
    assert list(actions) == ["create"]


async def test_scope_validation_and_escalation_denial(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async, apps=("bookings",))
    # One read and one write scope per product in entitlements.PRODUCTS.
    assert {
        "bookings.read",
        "bookings.write",
        "rewards.read",
        "rewards.write",
    } <= set(api_key_scopes.all_scopes())
    unknown = await _create(async_client, admin, org, scopes=["bookings.delete"])
    assert unknown.status_code == 422
    # Entitled to bookings, not to rewards: the key cannot hold a rewards scope.
    denied = await _create(
        async_client, admin, org, scopes=["bookings.read", "rewards.read"]
    )
    assert denied.status_code == 403
    assert "rewards.read" in denied.json()["detail"]
    assert (
        await db_async.scalar(select(ApiKey.id).where(ApiKey.organisation_id == org.id))
    ) is None

    member = await make_user(db_async)
    await service.add_member(
        db_async, organisation_id=org.id, user_id=member.id, role=MembershipRole.MEMBER
    )
    await db_async.commit()
    as_member = await async_client.post(
        f"{URL}/org/api-keys",
        headers=headers_for(member, org.id),
        json={"name": "x", "scopes": ["bookings.read"]},
    )
    assert as_member.status_code == 403
    assert (
        await async_client.get(
            f"{URL}/org/api-keys", headers=headers_for(member, org.id)
        )
    ).status_code == 403

    superuser = await make_user(db_async, superuser=True)
    as_outsider = await async_client.post(
        f"{URL}/org/api-keys",
        headers=headers_for(superuser, org.id),
        json={"name": "x", "scopes": ["bookings.read"]},
    )
    assert as_outsider.status_code == 404, "no superuser bypass"


async def test_rotation_overlaps_then_old_key_stops(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async)
    old = (await _create(async_client, admin, org)).json()
    resp = await async_client.post(
        f"{URL}/org/api-keys/{old['id']}/rotate",
        headers=headers_for(admin, org.id),
        json={},
    )
    assert resp.status_code == 201, resp.text
    new = resp.json()
    assert new["secret"] != old["secret"]
    assert new["rotated_from_id"] == old["id"]
    assert new["scopes"] == old["scopes"] and new["name"] == old["name"]

    old_row = await db_async.get(ApiKey, old["id"])
    assert old_row is not None
    await db_async.refresh(old_row)
    assert old_row.revoked_at is None
    assert old_row.expires_at is not None
    left = old_row.expires_at - utc_now()
    assert timedelta(hours=23) < left <= timedelta(hours=24)

    for secret in (old["secret"], new["secret"]):
        got = await async_client.get(f"{URL}/org/key-info", headers=_bearer(secret))
        assert got.status_code == 200

    old_row.expires_at = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    assert (
        await async_client.get(f"{URL}/org/key-info", headers=_bearer(old["secret"]))
    ).status_code == 401
    assert (
        await async_client.get(f"{URL}/org/key-info", headers=_bearer(new["secret"]))
    ).status_code == 200

    again = await async_client.post(
        f"{URL}/org/api-keys/{old['id']}/rotate",
        headers=headers_for(admin, org.id),
        json={},
    )
    assert again.status_code == 409, "an expired key cannot be rotated"


async def test_rotation_with_no_overlap_revokes_the_old_key_now(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async)
    old = (await _create(async_client, admin, org)).json()
    resp = await async_client.post(
        f"{URL}/org/api-keys/{old['id']}/rotate",
        headers=headers_for(admin, org.id),
        json={"overlap_hours": 0},
    )
    assert resp.status_code == 201
    assert (
        await async_client.get(f"{URL}/org/key-info", headers=_bearer(old["secret"]))
    ).status_code == 401
    assert (
        await async_client.get(
            f"{URL}/org/key-info", headers=_bearer(resp.json()["secret"])
        )
    ).status_code == 200


async def test_rotation_cannot_carry_a_lost_entitlement_forward(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async)
    old = (await _create(async_client, admin, org)).json()
    await service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="bookings", enabled=False
    )
    await db_async.commit()
    resp = await async_client.post(
        f"{URL}/org/api-keys/{old['id']}/rotate",
        headers=headers_for(admin, org.id),
        json={},
    )
    assert resp.status_code == 403


async def test_cross_organisation_access_is_denied(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin_a, org_a = await _setup(db_async)
    admin_b, org_b = await _setup(db_async)
    key_a = (await _create(async_client, admin_a, org_a)).json()

    for suffix in ("rotate", "revoke"):
        resp = await async_client.post(
            f"{URL}/org/api-keys/{key_a['id']}/{suffix}",
            headers=headers_for(admin_b, org_b.id),
            json={},
        )
        assert resp.status_code == 404, suffix
    # Naming A in the header without membership is also a 404.
    resp = await async_client.get(
        f"{URL}/org/api-keys", headers=headers_for(admin_b, org_a.id)
    )
    assert resp.status_code == 404
    listed = await async_client.get(
        f"{URL}/org/api-keys", headers=headers_for(admin_b, org_b.id)
    )
    assert listed.json()["count"] == 0
    row = await db_async.get(ApiKey, key_a["id"])
    assert row is not None
    await db_async.refresh(row)
    assert row.revoked_at is None


async def test_control_plane_lists_filters_and_revokes(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin_a, org_a = await _setup(db_async)
    admin_b, org_b = await _setup(db_async)
    key_a = (await _create(async_client, admin_a, org_a)).json()
    await _create(async_client, admin_b, org_b)
    superuser = await make_user(db_async, superuser=True)
    headers = headers_for(superuser)

    everything = await async_client.get(f"{URL}/admin/api-keys", headers=headers)
    assert everything.status_code == 200
    assert everything.json()["count"] >= 2
    filtered = await async_client.get(
        f"{URL}/admin/api-keys", headers=headers, params={"organisation_id": org_a.id}
    )
    assert [k["id"] for k in filtered.json()["data"]] == [key_a["id"]]
    assert key_a["secret"] not in filtered.text

    revoked = await async_client.post(
        f"{URL}/admin/api-keys/{key_a['id']}/revoke", headers=headers
    )
    assert revoked.status_code == 200 and revoked.json()["revoked_at"]
    assert (
        await async_client.get(f"{URL}/org/key-info", headers=_bearer(key_a["secret"]))
    ).status_code == 401
    missing = await async_client.post(
        f"{URL}/admin/api-keys/key_nope/revoke", headers=headers
    )
    assert missing.status_code == 404

    plain = headers_for(admin_a)
    assert (
        await async_client.get(f"{URL}/admin/api-keys", headers=plain)
    ).status_code == 403
    assert (
        await async_client.post(
            f"{URL}/admin/api-keys/{key_a['id']}/revoke", headers=plain
        )
    ).status_code == 403


async def test_create_rotate_and_revoke_are_audited_without_the_hash(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async)
    first = (await _create(async_client, admin, org)).json()
    rotated = await async_client.post(
        f"{URL}/org/api-keys/{first['id']}/rotate",
        headers=headers_for(admin, org.id),
        json={},
    )
    second = rotated.json()
    await async_client.post(
        f"{URL}/org/api-keys/{second['id']}/revoke", headers=headers_for(admin, org.id)
    )
    entries = (
        await db_async.scalars(
            select(AuditEntry).where(
                AuditEntry.record_type == "organisation_api_key",
                AuditEntry.entity_id == org.id,
            )
        )
    ).all()
    by_key = {(e.record_id, e.action) for e in entries}
    assert (first["id"], "create") in by_key
    assert (first["id"], "update") in by_key, "old key expiry change on rotation"
    assert (second["id"], "create") in by_key
    assert (second["id"], "update") in by_key, "revocation"
    dump = " ".join(str(e.changes) for e in entries)
    assert "key_hash" not in dump
    assert first["secret"] not in dump and second["secret"] not in dump
    assert all(e.actor_user_id == admin.id for e in entries)


async def test_rate_limit_answers_429(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    admin, org = await _setup(db_async)
    secret = (await _create(async_client, admin, org)).json()["secret"]
    monkeypatch.setattr(limiter, "enabled", True)
    monkeypatch.setattr(limiter.limiter, "hit", lambda *args, **kwargs: False)
    resp = await async_client.get(f"{URL}/org/key-info", headers=_bearer(secret))
    assert resp.status_code == 429


def test_scope_catalogue_covers_every_product() -> None:
    from src.organisations import entitlements

    assert {api_key_scopes.product_of(s) for s in api_key_scopes.all_scopes()} == set(
        entitlements.PRODUCTS
    )
    assert not api_key_scopes.is_valid("bookings")
    assert not api_key_scopes.is_valid("events.read")
    with pytest.raises(ValueError):
        require_api_key_scope("bookings.delete")


async def test_require_api_key_scope_checks_scope_and_entitlement(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin, org = await _setup(db_async, apps=("bookings", "rewards"))
    read_only = (
        await _create(async_client, admin, org, scopes=["bookings.read"])
    ).json()
    writer = (
        await _create(
            async_client, admin, org, scopes=["bookings.read", "bookings.write"]
        )
    ).json()

    app = FastAPI()

    @app.exception_handler(AppException)
    async def _handle(_request: Any, exc: AppException):  # noqa: ANN202
        from fastapi.responses import JSONResponse

        return JSONResponse({"detail": exc.message}, status_code=exc.status_code)

    async def _db() -> AsyncGenerator[AsyncSession]:
        yield db_async

    app.dependency_overrides[get_db] = _db

    @app.post("/write")
    async def write(
        caller: Annotated[
            ApiKeyContext, Depends(require_api_key_scope("bookings.write"))
        ],
    ) -> dict[str, str]:
        return {"organisation_id": caller.organisation_id}

    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://t") as client:
        assert (
            await client.post("/write", headers=_bearer(read_only["secret"]))
        ).status_code == 403
        ok = await client.post("/write", headers=_bearer(writer["secret"]))
        assert ok.status_code == 200 and ok.json() == {"organisation_id": org.id}
        # Entitlement is checked on every request, not only at creation.
        await service.set_app_enabled(
            db_async, organisation_id=org.id, app_key="bookings", enabled=False
        )
        await db_async.commit()
        assert (
            await client.post("/write", headers=_bearer(writer["secret"]))
        ).status_code == 403
        # A user JWT is never accepted.
        assert (
            await client.post("/write", headers=headers_for(admin))
        ).status_code == 401
