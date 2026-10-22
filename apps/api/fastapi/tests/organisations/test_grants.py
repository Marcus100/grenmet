"""Membership grants, the resolver and require_org_permission (ADR-0044, S1)."""

from datetime import timedelta
from typing import Annotated, Any

import httpx
import pytest
from fastapi import Depends, FastAPI, Request
from fastapi.responses import JSONResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import permissions
from src.auth.policy import has_permission, require_permission
from src.exceptions import AppException, AuthorizationError, app_exception_handler
from src.organisations import grants, role_bundles, service
from src.organisations.dependencies import OrgContext, require_org_permission
from src.organisations.exceptions import (
    GrantExpiryInvalidError,
    GrantNotHeldError,
    MembershipNotFoundError,
    RoleAlreadyGrantedError,
    RoleBundleUnknownError,
)
from src.organisations.members import apply_removal
from src.organisations.models import Membership, MembershipGrant, MembershipRole
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

DOOR = "events.door.scan"


def _probe_app() -> FastAPI:
    probe = FastAPI()

    async def handle(request: Request, exc: Exception) -> JSONResponse:
        assert isinstance(exc, AppException)
        return await app_exception_handler(request, exc)

    probe.add_exception_handler(AppException, handle)

    @probe.get("/door")
    async def door(
        context: Annotated[OrgContext, Depends(require_org_permission(DOOR))],
    ) -> dict[str, str]:
        return {"organisation_id": context.organisation_id}

    return probe


@pytest.fixture
async def probe(test_database: None) -> Any:
    assert test_database is None
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=_probe_app()), base_url="http://probe"
    ) as client:
        yield client


async def _membership(db: AsyncSession, org_id: str, user) -> Membership:
    return (
        await db.execute(
            select(Membership).where(
                Membership.organisation_id == org_id, Membership.user_id == user.id
            )
        )
    ).scalar_one()


async def _context(db: AsyncSession, org, user) -> OrgContext:
    resolved = await service.resolve_membership(
        db, user_id=user.id, organisation_id=org.id
    )
    return OrgContext(
        organisation=resolved.organisation, membership=resolved.membership, user=user
    )


async def _grant(db, org, grantor, target, role_key, **kw) -> MembershipGrant:
    row = await _membership(db, org.id, target)
    grant = await grants.grant_role(
        db,
        await _context(db, org, grantor),
        membership_id=row.id,
        role_key=role_key,
        **kw,
    )
    await db.commit()
    return grant


# ── Resolver ─────────────────────────────────────────────────────────────────


async def test_member_holds_nothing_without_a_grant(db_async: AsyncSession):
    member = await make_user(db_async)
    org = await make_org(
        db_async, "A", members=((member, MembershipRole.MEMBER),), apps=("events",)
    )
    row = await _membership(db_async, org.id, member)
    assert await grants.effective_keys(db_async, membership=row) == frozenset()


async def test_owner_and_admin_hold_every_entitled_product_key(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    admin = await make_user(db_async)
    org = await make_org(
        db_async,
        "A",
        members=((owner, MembershipRole.OWNER), (admin, MembershipRole.ADMIN)),
        apps=("events",),
    )
    for user in (owner, admin):
        keys = await grants.effective_keys(
            db_async, membership=await _membership(db_async, org.id, user)
        )
        assert DOOR in keys and "events.team.manage" in keys
        # Only entitled products; never API-key scope aliases.
        assert not any(k.startswith("bookings.") for k in keys)
        assert "bookings.read" not in keys


async def test_unentitled_product_gives_no_keys_even_when_granted(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "A",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=("events",),
    )
    await _grant(db_async, org, owner, member, "events-door")
    await service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="events", enabled=False
    )
    await db_async.commit()
    row = await _membership(db_async, org.id, member)
    assert await grants.effective_keys(db_async, membership=row) == frozenset()


async def test_grant_gives_exactly_the_bundle_and_ends_on_expiry_or_revoke(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "A",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=("events",),
    )
    grant = await _grant(db_async, org, owner, member, "events-door")
    row = await _membership(db_async, org.id, member)
    assert await grants.effective_keys(db_async, membership=row) == {DOOR}

    grant.expires_at = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    assert await grants.effective_keys(db_async, membership=row) == frozenset()

    grant.expires_at = None
    await db_async.commit()
    assert DOOR in await grants.effective_keys(db_async, membership=row)
    await grants.revoke_grant(
        db_async, await _context(db_async, org, owner), grant_id=grant.id
    )
    await db_async.commit()
    assert await grants.effective_keys(db_async, membership=row) == frozenset()


async def test_removed_member_loses_grants_and_rejoining_does_not_revive_them(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "A",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=("events",),
    )
    await _grant(db_async, org, owner, member, "events-door")
    row = await _membership(db_async, org.id, member)
    await apply_removal(
        db_async, org.id, row.id, actor_id=owner.id, actor_may_grant_owner=True
    )
    await db_async.commit()
    assert await grants.effective_keys(db_async, membership=row) == frozenset()
    row.status = "active"
    await db_async.commit()
    assert await grants.effective_keys(db_async, membership=row) == frozenset()


async def test_unknown_stored_role_key_is_ignored(db_async: AsyncSession):
    owner = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "A",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=("events",),
    )
    row = await _membership(db_async, org.id, member)
    db_async.add(
        MembershipGrant(
            id="grant_legacy",
            membership_id=row.id,
            organisation_id=org.id,
            role_key="events-retired",
        )
    )
    await db_async.commit()
    assert await grants.effective_keys(db_async, membership=row) == frozenset()


# ── Dependency ───────────────────────────────────────────────────────────────


async def test_dependency_requires_the_key_and_gives_no_superuser_bypass(
    probe: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    door = await make_user(db_async)
    plain = await make_user(db_async)
    superuser = await make_user(db_async, superuser=True)
    org = await make_org(
        db_async,
        "A",
        members=(
            (owner, MembershipRole.OWNER),
            (door, MembershipRole.MEMBER),
            (plain, MembershipRole.MEMBER),
            (superuser, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    await _grant(db_async, org, owner, door, "events-door")

    def get(user):
        return probe.get("/door", headers=headers_for(user, org.id))

    assert (await get(owner)).status_code == 200
    assert (await get(door)).status_code == 200
    assert (await get(plain)).status_code == 403
    # A superuser who is a plain member holds nothing: has_permission is not used.
    assert (await get(superuser)).status_code == 403


async def test_cross_organisation_grants_do_not_travel(
    probe: httpx.AsyncClient, db_async: AsyncSession
):
    owner_a = await make_user(db_async)
    owner_b = await make_user(db_async)
    door = await make_user(db_async)
    outsider_superuser = await make_user(db_async, superuser=True)
    org_a = await make_org(
        db_async,
        "A",
        members=((owner_a, MembershipRole.OWNER), (door, MembershipRole.MEMBER)),
        apps=("events",),
    )
    org_b = await make_org(
        db_async,
        "B",
        members=((owner_b, MembershipRole.OWNER), (door, MembershipRole.MEMBER)),
        apps=("events",),
    )
    await _grant(db_async, org_a, owner_a, door, "events-door")
    # Door in A is a plain member in B; the A grant does not apply there.
    assert (
        await probe.get("/door", headers=headers_for(door, org_a.id))
    ).status_code == 200
    assert (
        await probe.get("/door", headers=headers_for(door, org_b.id))
    ).status_code == 403
    # Owner of A is a stranger to B (404, same as unknown), as is a superuser.
    for stranger in (owner_a, outsider_superuser):
        assert (
            await probe.get("/door", headers=headers_for(stranger, org_b.id))
        ).status_code == 404


async def test_organisation_without_the_product_entitlement_is_refused(
    probe: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    org = await make_org(db_async, "A", members=((owner, MembershipRole.OWNER),))
    response = await probe.get("/door", headers=headers_for(owner, org.id))
    assert response.status_code == 403


def test_dependency_builder_refuses_keys_that_are_not_product_keys():
    for key in ("events.moderate", "bookings.read", "no.such.key"):
        with pytest.raises(ValueError):
            require_org_permission(key)


# ── Global checks still refuse bound keys ────────────────────────────────────


async def test_bound_key_through_has_permission_is_refused_even_for_superuser(
    db_async: AsyncSession,
):
    superuser = await make_user(db_async, superuser=True)
    for key in permissions.ORGANISATION_BOUND_KEYS:
        assert has_permission(current_user=superuser, permission_key=key) is False
    with pytest.raises(AuthorizationError):
        require_permission(current_user=superuser, permission_key=DOOR)


# ── Lifecycle rules ──────────────────────────────────────────────────────────


async def test_grantor_must_hold_the_bundle_and_team_manage(db_async: AsyncSession):
    owner = await make_user(db_async)
    lead = await make_user(db_async)
    target = await make_user(db_async)
    org = await make_org(
        db_async,
        "A",
        members=(
            (owner, MembershipRole.OWNER),
            (lead, MembershipRole.MEMBER),
            (target, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    # events-door alone is not enough to hand out events-door.
    await _grant(db_async, org, owner, lead, "events-door")
    with pytest.raises(GrantNotHeldError):
        await _grant(db_async, org, lead, target, "events-door")
    # Team management alone is not enough either: the bundle must be held too.
    await _grant(db_async, org, owner, lead, "events-team")
    with pytest.raises(GrantNotHeldError):
        await _grant(db_async, org, lead, target, "events-till")
    # Door plus team management may hand out the door role, but not refunds.
    grant = await _grant(db_async, org, lead, target, "events-door")
    assert grant.granted_by == lead.id
    with pytest.raises(GrantNotHeldError):
        await _grant(db_async, org, lead, target, "events-refunds")


async def test_grant_input_rules(db_async: AsyncSession):
    owner = await make_user(db_async)
    member = await make_user(db_async)
    other_owner = await make_user(db_async)
    org = await make_org(
        db_async,
        "A",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=("events",),
    )
    other = await make_org(
        db_async, "B", members=((other_owner, MembershipRole.OWNER),), apps=("events",)
    )
    with pytest.raises(RoleBundleUnknownError):
        await _grant(db_async, org, owner, member, "events-god")
    with pytest.raises(GrantExpiryInvalidError):
        await _grant(db_async, org, owner, member, "events-door", expires_at=utc_now())
    await _grant(db_async, org, owner, member, "events-door")
    with pytest.raises(RoleAlreadyGrantedError):
        await _grant(db_async, org, owner, member, "events-door")
    # A membership of another organisation is not addressable from this one.
    foreign = await _membership(db_async, other.id, other_owner)
    with pytest.raises(MembershipNotFoundError):
        await grants.grant_role(
            db_async,
            await _context(db_async, org, owner),
            membership_id=foreign.id,
            role_key="events-door",
        )


async def test_lapsed_grant_can_be_granted_again(db_async: AsyncSession):
    owner = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "A",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=("events",),
    )
    first = await _grant(db_async, org, owner, member, "events-door")
    first.expires_at = utc_now() - timedelta(minutes=1)
    await db_async.commit()
    second = await _grant(db_async, org, owner, member, "events-door")
    assert second.id != first.id
    row = await _membership(db_async, org.id, member)
    assert DOOR in await grants.effective_keys(db_async, membership=row)


async def test_grant_changes_are_audited_with_the_actor(db_async: AsyncSession):
    owner = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "A",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=("events",),
    )
    grant = await _grant(db_async, org, owner, member, "events-door")
    await grants.revoke_grant(
        db_async, await _context(db_async, org, owner), grant_id=grant.id
    )
    await db_async.commit()
    entries = list(
        (
            await db_async.scalars(
                select(AuditEntry)
                .where(
                    AuditEntry.entity_type == "platform_organisation",
                    AuditEntry.entity_id == org.id,
                    AuditEntry.record_type == "organisation_membership_grant",
                )
                .order_by(AuditEntry.created_at)
                .execution_options(populate_existing=True)
            )
        ).all()
    )
    assert [(e.action, e.actor_user_id) for e in entries] == [
        ("create", owner.id),
        ("update", owner.id),
    ]
    assert any(c["field"] == "revoked_at" for c in entries[1].changes)


# ── Registry ─────────────────────────────────────────────────────────────────


def test_every_bundle_key_is_an_organisation_key_in_the_catalogue():
    for role_key, keys in role_bundles.ROLE_BUNDLES.items():
        assert keys, role_key
        assert keys <= permissions.ORGANISATION_BOUND_KEYS, role_key
        assert keys <= grants.product_keys(), role_key
        assert role_key.startswith(role_bundles.product_of_key(next(iter(keys))))
