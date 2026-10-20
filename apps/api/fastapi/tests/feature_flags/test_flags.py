"""Feature flags (ADR-0020, PF7): admin management, evaluation, gating, audit."""

import uuid
from datetime import timedelta

import httpx
import pytest
from fastapi import Depends, FastAPI
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.config import settings
from src.exceptions import AppException, app_exception_handler
from src.feature_flags import service
from src.feature_flags.dependencies import require_flag, require_org_flag
from src.organisations.models import MembershipRole
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

URL = "/api/v1/feature-flags"


@pytest.fixture(autouse=True)
def _fresh_cache():
    service.clear_cache()
    yield
    service.clear_cache()


def _key() -> str:
    return f"flag-{uuid.uuid4().hex[:8]}"


async def _create(
    client: httpx.AsyncClient, headers: dict[str, str], **extra: object
) -> httpx.Response:
    return await client.post(
        f"{URL}/admin", headers=headers, json={"key": _key(), **extra}
    )


async def _admin(db: AsyncSession) -> dict[str, str]:
    return headers_for(await make_user(db, superuser=True))


async def test_create_defaults_to_off_and_unknown_flag_is_off(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers = await _admin(db_async)
    resp = await _create(async_client, headers, description="Guards the new form")
    assert resp.status_code == 201, resp.text
    body = resp.json()
    assert body["enabled"] is False and body["exposed"] is False
    assert body["audience"]["everyone"] is False
    assert body["stale"] is False
    assert not await service.is_enabled(db_async, body["key"])
    assert not await service.is_enabled(db_async, "no-such-flag")


async def test_duplicate_key_and_bad_key_are_rejected(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers = await _admin(db_async)
    key = _key()
    assert (
        await async_client.post(f"{URL}/admin", headers=headers, json={"key": key})
    ).status_code == 201
    dup = await async_client.post(f"{URL}/admin", headers=headers, json={"key": key})
    assert dup.status_code == 409
    for bad in ("Has Caps", "under_score", "-lead", "trail-", "double--dash"):
        resp = await async_client.post(
            f"{URL}/admin", headers=headers, json={"key": bad}
        )
        assert resp.status_code == 422, bad


async def test_enabling_outside_local_needs_a_success_metric(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    headers = await _admin(db_async)
    # Local: no metric needed.
    monkeypatch.setattr(settings, "ENVIRONMENT", "local")
    assert (
        await _create(async_client, headers, enabled=True, audience={"everyone": True})
    ).status_code == 201

    monkeypatch.setattr(settings, "ENVIRONMENT", "staging")
    refused = await _create(async_client, headers, enabled=True)
    assert refused.status_code == 422
    blank = await _create(async_client, headers, enabled=True, success_metric="  ")
    assert blank.status_code == 422
    # Created off, then enabled by PATCH: same rule.
    created = (await _create(async_client, headers)).json()
    patch = await async_client.patch(
        f"{URL}/admin/{created['id']}", headers=headers, json={"enabled": True}
    )
    assert patch.status_code == 422
    ok = await async_client.patch(
        f"{URL}/admin/{created['id']}",
        headers=headers,
        json={"enabled": True, "success_metric": "Error rate under 1% for 7 days"},
    )
    assert ok.status_code == 200 and ok.json()["enabled"] is True
    # Clearing the metric while enabled is refused too.
    cleared = await async_client.patch(
        f"{URL}/admin/{created['id']}", headers=headers, json={"success_metric": None}
    )
    assert cleared.status_code == 422
    # Disabling never needs one.
    off = await async_client.patch(
        f"{URL}/admin/{created['id']}",
        headers=headers,
        json={"enabled": False, "success_metric": None},
    )
    assert off.status_code == 200 and off.json()["success_metric"] is None


async def test_patch_updates_only_sent_fields_and_null_clears(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers = await _admin(db_async)
    created = (
        await _create(
            async_client,
            headers,
            description="keep me",
            owner="Ops",
            audience={"organisation_ids": ["org_a"]},
        )
    ).json()
    resp = await async_client.patch(
        f"{URL}/admin/{created['id']}",
        headers=headers,
        json={"exposed": True, "owner": None},
    )
    body = resp.json()
    assert body["exposed"] is True and body["owner"] is None
    assert body["description"] == "keep me"
    assert body["audience"]["organisation_ids"] == ["org_a"]
    assert body["key"] == created["key"]


async def test_get_list_delete_and_unknown_id(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers = await _admin(db_async)
    created = (await _create(async_client, headers)).json()
    got = await async_client.get(f"{URL}/admin/{created['id']}", headers=headers)
    assert got.json()["key"] == created["key"]
    listed = await async_client.get(f"{URL}/admin", headers=headers)
    assert created["key"] in [f["key"] for f in listed.json()["data"]]
    assert listed.json()["count"] >= 1
    assert (
        await async_client.delete(f"{URL}/admin/{created['id']}", headers=headers)
    ).status_code == 204
    for call in (
        async_client.get(f"{URL}/admin/{created['id']}", headers=headers),
        async_client.patch(f"{URL}/admin/{created['id']}", headers=headers, json={}),
        async_client.delete(f"{URL}/admin/{created['id']}", headers=headers),
    ):
        assert (await call).status_code == 404


async def test_stale_lists_expired_and_overdue_review(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers = await _admin(db_async)
    past = (utc_now() - timedelta(days=1)).isoformat() + "Z"
    future = (utc_now() + timedelta(days=30)).isoformat() + "Z"
    expired = (await _create(async_client, headers, expires_at=past)).json()
    overdue = (await _create(async_client, headers, review_by=past)).json()
    fresh = (
        await _create(async_client, headers, expires_at=future, review_by=future)
    ).json()
    plain = (await _create(async_client, headers)).json()
    assert expired["stale"] and overdue["stale"]
    assert not fresh["stale"] and not plain["stale"]

    stale = await async_client.get(f"{URL}/admin/stale", headers=headers)
    assert stale.status_code == 200
    keys = {f["key"] for f in stale.json()["data"]}
    assert {expired["key"], overdue["key"]} <= keys
    assert not ({fresh["key"], plain["key"]} & keys)
    assert stale.json()["count"] == len(stale.json()["data"])


async def test_expired_flag_evaluates_off_but_overdue_review_stays_on(
    db_async: AsyncSession,
) -> None:
    from src.feature_flags.models import FeatureFlag

    expired, overdue = _key(), _key()
    past = utc_now() - timedelta(hours=1)
    for key, kwargs in (
        (expired, {"expires_at": past}),
        (overdue, {"review_by": past}),
    ):
        db_async.add(
            FeatureFlag(key=key, enabled=True, audience={"everyone": True}, **kwargs)
        )
    await db_async.commit()
    assert not await service.is_enabled(db_async, expired)
    assert await service.is_enabled(db_async, overdue)


async def test_evaluation_rules_via_service(db_async: AsyncSession) -> None:
    from src.feature_flags.models import FeatureFlag

    user = uuid.uuid4()
    cases = {
        "everyone": ({"everyone": True}, True, True),
        "org": ({"organisation_ids": ["org_a"]}, True, False),
        "user": ({"user_ids": [str(user)]}, True, True),
        "percent-all": ({"percentage": 100}, True, True),
        "percent-none": ({"percentage": 0}, False, False),
        "other-env": ({"everyone": True, "environments": ["production"]}, False, False),
    }
    for key, (audience, _, _) in cases.items():
        db_async.add(FeatureFlag(key=key, enabled=True, audience=audience))
    db_async.add(
        FeatureFlag(key="disabled", enabled=False, audience={"everyone": True})
    )
    await db_async.commit()
    for key, (_, with_org, without_org) in cases.items():
        assert (
            await service.is_enabled(
                db_async, key, organisation_id="org_a", user_id=user
            )
            is with_org
        ), key
        assert await service.is_enabled(
            db_async, key, organisation_id="org_b", user_id=user
        ) is (key in {"everyone", "user", "percent-all"}), key
        assert await service.is_enabled(db_async, key) is (key == "everyone"), (
            key,
            without_org,
        )
    assert not await service.is_enabled(db_async, "disabled")


async def test_cache_serves_for_ttl_and_writes_clear_it(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    headers = await _admin(db_async)
    created = (
        await _create(async_client, headers, enabled=True, audience={"everyone": True})
    ).json()
    key = created["key"]
    assert await service.is_enabled(db_async, key)

    # A write that bypasses the router (no cache clear) stays invisible until the TTL.
    from src.feature_flags.models import FeatureFlag

    row = await db_async.get(FeatureFlag, created["id"])
    assert row is not None
    row.enabled = False
    await db_async.commit()
    assert await service.is_enabled(db_async, key)

    # Through the API the change is visible at once.
    resp = await async_client.patch(
        f"{URL}/admin/{created['id']}", headers=headers, json={"enabled": True}
    )
    assert resp.status_code == 200
    db_async.expire_all()  # the test session's identity map, not the service cache
    assert await service.is_enabled(db_async, key)
    await async_client.patch(
        f"{URL}/admin/{created['id']}", headers=headers, json={"enabled": False}
    )
    db_async.expire_all()
    assert not await service.is_enabled(db_async, key)
    # Delete clears too.
    await async_client.patch(
        f"{URL}/admin/{created['id']}",
        headers=headers,
        json={"enabled": True},
    )
    db_async.expire_all()
    assert await service.is_enabled(db_async, key)
    await async_client.delete(f"{URL}/admin/{created['id']}", headers=headers)
    assert not await service.is_enabled(db_async, key)


async def test_cache_expires_after_ttl(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    from src.feature_flags.models import FeatureFlag

    key = _key()
    db_async.add(FeatureFlag(key=key, enabled=True, audience={"everyone": True}))
    await db_async.commit()
    assert await service.is_enabled(db_async, key)
    row = (
        await db_async.scalars(select(FeatureFlag).where(FeatureFlag.key == key))
    ).one()
    row.enabled = False
    await db_async.commit()
    assert await service.is_enabled(db_async, key)
    real = service.time.monotonic()
    monkeypatch.setattr(
        service.time, "monotonic", lambda: real + service.CACHE_TTL_SECONDS + 1
    )
    assert not await service.is_enabled(db_async, key)


async def test_evaluate_routes_only_return_exposed_flags_per_subject(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    admin = await _admin(db_async)
    member = await make_user(db_async)
    outsider = await make_user(db_async)
    org_a = await make_org(db_async, "A Co", members=((member, MembershipRole.MEMBER),))
    org_b = await make_org(
        db_async, "B Co", members=((outsider, MembershipRole.MEMBER),)
    )
    visible = (
        await _create(
            async_client,
            admin,
            enabled=True,
            exposed=True,
            audience={"organisation_ids": [org_a.id]},
        )
    ).json()["key"]
    everyone = (
        await _create(
            async_client,
            admin,
            enabled=True,
            exposed=True,
            audience={"everyone": True},
        )
    ).json()["key"]
    internal = (
        await _create(async_client, admin, enabled=True, audience={"everyone": True})
    ).json()["key"]
    for_user = (
        await _create(
            async_client,
            admin,
            enabled=True,
            exposed=True,
            audience={"user_ids": [str(member.id)]},
        )
    ).json()["key"]

    as_member = await async_client.get(
        f"{URL}/org/evaluate", headers=headers_for(member, org_a.id)
    )
    assert as_member.status_code == 200, as_member.text
    flags = as_member.json()["flags"]
    assert flags[visible] is True and flags[everyone] is True
    assert flags[for_user] is True
    assert internal not in flags, "internal flags never leak"

    # Cross-organisation isolation: org B's member is not in A's audience, and
    # cannot evaluate in org A's context at all.
    as_outsider = await async_client.get(
        f"{URL}/org/evaluate", headers=headers_for(outsider, org_b.id)
    )
    assert as_outsider.json()["flags"][visible] is False
    assert as_outsider.json()["flags"][for_user] is False
    forged = await async_client.get(
        f"{URL}/org/evaluate", headers=headers_for(outsider, org_a.id)
    )
    assert forged.status_code == 404

    me = await async_client.get(f"{URL}/me/evaluate", headers=headers_for(member))
    assert me.status_code == 200
    mine = me.json()["flags"]
    assert mine[everyone] is True and mine[for_user] is True
    assert mine[visible] is False, "organisation targeting needs an organisation"
    assert internal not in mine

    assert (await async_client.get(f"{URL}/me/evaluate")).status_code == 401
    assert (await async_client.get(f"{URL}/org/evaluate")).status_code == 401
    no_header = await async_client.get(
        f"{URL}/org/evaluate", headers=headers_for(member)
    )
    assert no_header.status_code == 400


async def test_admin_routes_deny_non_superusers_and_anonymous(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    owner = await make_user(db_async)
    org = await make_org(db_async, "Owner Co", members=((owner, MembershipRole.OWNER),))
    calls = [
        ("GET", f"{URL}/admin", None),
        ("GET", f"{URL}/admin/stale", None),
        ("POST", f"{URL}/admin", {"key": _key()}),
        ("GET", f"{URL}/admin/flag_x", None),
        ("PATCH", f"{URL}/admin/flag_x", {"enabled": False}),
        ("DELETE", f"{URL}/admin/flag_x", None),
    ]
    for method, url, body in calls:
        assert (await async_client.request(method, url, json=body)).status_code == 401
        denied = await async_client.request(
            method, url, json=body, headers=headers_for(owner, org.id)
        )
        assert denied.status_code == 403, (method, url)


async def test_writes_are_audited_with_the_actor(
    async_client: httpx.AsyncClient, db_async: AsyncSession
) -> None:
    actor = await make_user(db_async, superuser=True)
    headers = headers_for(actor)
    created = (await _create(async_client, headers, description="first")).json()
    await async_client.patch(
        f"{URL}/admin/{created['id']}", headers=headers, json={"exposed": True}
    )
    await async_client.delete(f"{URL}/admin/{created['id']}", headers=headers)
    entries = (
        await db_async.scalars(
            select(AuditEntry)
            .where(
                AuditEntry.record_type == "feature_flag",
                AuditEntry.record_id == created["id"],
            )
            .order_by(AuditEntry.created_at)
        )
    ).all()
    assert [e.action for e in entries] == ["create", "update", "delete"]
    assert all(e.actor_user_id == actor.id for e in entries)
    assert [c["field"] for c in entries[1].changes] == ["exposed"]


async def test_require_flag_gates_routes_with_404(db_async: AsyncSession) -> None:
    from src.feature_flags.models import FeatureFlag

    gated, off = _key(), _key()
    org_flag = _key()
    member = await make_user(db_async)
    other = await make_user(db_async)
    org = await make_org(
        db_async, "Gate Co", members=((member, MembershipRole.MEMBER),)
    )
    other_org = await make_org(
        db_async, "Other Co", members=((other, MembershipRole.MEMBER),)
    )
    db_async.add(FeatureFlag(key=gated, enabled=True, audience={"everyone": True}))
    db_async.add(FeatureFlag(key=off, enabled=False, audience={"everyone": True}))
    db_async.add(
        FeatureFlag(key=org_flag, enabled=True, audience={"organisation_ids": [org.id]})
    )
    await db_async.commit()

    probe = FastAPI()
    probe.exception_handler(AppException)(app_exception_handler)

    @probe.get("/_probe/on", dependencies=[Depends(require_flag(gated))])
    async def probe_on() -> dict[str, bool]:
        return {"ok": True}

    @probe.get("/_probe/off", dependencies=[Depends(require_flag(off))])
    async def probe_off() -> dict[str, bool]:
        return {"ok": True}

    @probe.get("/_probe/unknown", dependencies=[Depends(require_flag("nope"))])
    async def probe_unknown() -> dict[str, bool]:
        return {"ok": True}

    @probe.get("/_probe/org")
    async def probe_org(
        context=Depends(require_org_flag(org_flag)),
    ) -> dict[str, str]:
        return {"organisation": context.organisation_id}

    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=probe), base_url="http://probe"
    ) as client:
        assert (await client.get("/_probe/on")).status_code == 200
        assert (await client.get("/_probe/off")).status_code == 404
        assert (await client.get("/_probe/unknown")).status_code == 404
        assert (
            await client.get("/_probe/org", headers=headers_for(member, org.id))
        ).json() == {"organisation": org.id}
        assert (
            await client.get("/_probe/org", headers=headers_for(other, other_org.id))
        ).status_code == 404
