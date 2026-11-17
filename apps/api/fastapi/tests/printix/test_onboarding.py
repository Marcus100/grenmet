"""Barrels administrator onboarding of organisers and gate leads (ADR-0060 amendment).

A superuser with an authenticator sets a member's Printix access; the same step gives
or takes away the ``printix-member`` sign-in role. Every change is audited.
"""

import uuid
from collections.abc import Awaitable, Callable
from typing import Any

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import Role, User, UserRoleLink
from src.auth.models import Session as LoginSession
from src.auth.permissions import seed_permissions_and_roles_async
from src.config import settings
from src.organisations import grants
from src.organisations.models import Membership, MembershipGrant, MembershipRole
from tests.factories import make_user
from tests.organisations.support import make_org

from .org_support import _enrol, _sign_in, make_org_member

pytestmark = pytest.mark.usefixtures("db_async")

BASE = f"{settings.API_V1_STR}/printix/admin/organisations"
MakeAdmin = Callable[[], Awaitable[tuple[User, dict[str, str]]]]
REASON = "Printix onboarding for the 14 Dec rehearsal"


@pytest.fixture(autouse=True)
async def _roles(db_async: AsyncSession) -> None:
    await seed_permissions_and_roles_async(db_async)


@pytest.fixture
async def admin_headers(mfa_admin: MakeAdmin) -> dict[str, str]:
    _, headers = await mfa_admin()
    return headers


async def _has_app_role(db: AsyncSession, user: User) -> bool:
    return (
        await db.scalar(
            select(UserRoleLink.user_id)
            .join(Role, Role.id == UserRoleLink.role_id)
            .where(UserRoleLink.user_id == user.id, Role.name == "printix-member")
        )
        is not None
    )


async def _live_bundles(db: AsyncSession, membership_id: str) -> set[str]:
    rows = await db.scalars(
        select(MembershipGrant.role_key).where(
            MembershipGrant.membership_id == membership_id,
            MembershipGrant.revoked_at.is_(None),
        )
    )
    return set(rows.all())


async def _member(
    db: AsyncSession, apps: tuple[str, ...] = ("printix",)
) -> tuple[Any, User, Membership]:
    org = await make_org(db, f"Org {uuid.uuid4().hex[:6]}", apps=apps)
    user = await make_user(db)
    membership = await make_org_member(db, org, user)
    return org, user, membership


def _put(org_id: str, membership_id: str) -> str:
    return f"{BASE}/{org_id}/members/{membership_id}/access"


# --- Who may call ---------------------------------------------------------------


async def test_a_normal_user_is_refused(
    async_client: httpx.AsyncClient,
    normal_user_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org, _, membership = await _member(db_async)
    calls = [
        await async_client.get(
            f"{BASE}/{org.id}/members", headers=normal_user_token_headers_async
        ),
        await async_client.put(
            _put(org.id, membership.id),
            headers=normal_user_token_headers_async,
            json={"access": "organiser", "reason": REASON},
        ),
        await async_client.post(
            f"{BASE}/{org.id}/members",
            headers=normal_user_token_headers_async,
            json={"email": "x@example.com", "access": "organiser", "reason": REASON},
        ),
    ]
    assert [c.status_code for c in calls] == [403, 403, 403]
    assert await _live_bundles(db_async, membership.id) == set()


async def test_a_superuser_without_an_authenticator_is_refused(
    async_client: httpx.AsyncClient,
    superuser_token_headers_async: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org, user, membership = await _member(db_async)
    response = await async_client.put(
        _put(org.id, membership.id),
        headers=superuser_token_headers_async,
        json={"access": "organiser", "reason": REASON},
    )
    assert response.status_code == 403
    assert await _live_bundles(db_async, membership.id) == set()
    assert not await _has_app_role(db_async, user)


async def test_a_reason_is_required(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org, _, membership = await _member(db_async)
    response = await async_client.put(
        _put(org.id, membership.id),
        headers=admin_headers,
        json={"access": "organiser"},
    )
    assert response.status_code == 422


# --- Setting access ---------------------------------------------------------------


@pytest.mark.parametrize(
    ("access", "bundle"),
    [("organiser", "printix-organiser"), ("gate_lead", "printix-gate-lead")],
)
async def test_giving_access_grants_the_bundle_and_the_sign_in_role(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
    access: str,
    bundle: str,
) -> None:
    org, user, membership = await _member(db_async)

    response = await async_client.put(
        _put(org.id, membership.id),
        headers=admin_headers,
        json={"access": access, "reason": REASON},
    )

    assert response.status_code == 200
    body = response.json()
    assert body["access"] == access
    assert body["can_sign_in"] is True
    assert await _live_bundles(db_async, membership.id) == {bundle}
    assert await _has_app_role(db_async, user)
    fresh = await db_async.get(Membership, membership.id, populate_existing=True)
    assert fresh is not None
    keys = await grants.effective_keys(db_async, membership=fresh)
    assert "printix.gates.manage" in keys
    assert ("printix.events.manage" in keys) is (access == "organiser")


async def test_a_change_replaces_the_old_bundle(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org, _, membership = await _member(db_async)
    for access in ("organiser", "gate_lead", "gate_lead"):
        response = await async_client.put(
            _put(org.id, membership.id),
            headers=admin_headers,
            json={"access": access, "reason": REASON},
        )
        assert response.status_code == 200
    assert await _live_bundles(db_async, membership.id) == {"printix-gate-lead"}


async def test_removing_the_last_access_takes_the_role_and_ends_sessions(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org, user, membership = await _member(db_async)
    await async_client.put(
        _put(org.id, membership.id),
        headers=admin_headers,
        json={"access": "organiser", "reason": REASON},
    )
    await _enrol(db_async, user)
    await _sign_in(db_async, user)

    response = await async_client.put(
        _put(org.id, membership.id),
        headers=admin_headers,
        json={"access": "none", "reason": REASON},
    )

    assert response.status_code == 200
    assert response.json()["access"] == "none"
    assert await _live_bundles(db_async, membership.id) == set()
    assert not await _has_app_role(db_async, user)
    live = await db_async.scalars(
        select(LoginSession).where(
            LoginSession.user_id == user.id,
            LoginSession.app_name == "printix",
            LoginSession.revoked_at.is_(None),
        )
    )
    assert live.all() == []


async def test_the_role_stays_while_another_organisation_gives_access(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org_a, user, member_a = await _member(db_async)
    org_b = await make_org(db_async, f"Org {uuid.uuid4().hex[:6]}", apps=("printix",))
    member_b = await make_org_member(db_async, org_b, user)
    for org, membership in ((org_a, member_a), (org_b, member_b)):
        await async_client.put(
            _put(org.id, membership.id),
            headers=admin_headers,
            json={"access": "gate_lead", "reason": REASON},
        )

    await async_client.put(
        _put(org_a.id, member_a.id),
        headers=admin_headers,
        json={"access": "none", "reason": REASON},
    )
    assert await _has_app_role(db_async, user)

    await async_client.put(
        _put(org_b.id, member_b.id),
        headers=admin_headers,
        json={"access": "none", "reason": REASON},
    )
    assert not await _has_app_role(db_async, user)


async def test_an_organisation_without_printix_is_refused(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org, user, membership = await _member(db_async, apps=())
    response = await async_client.put(
        _put(org.id, membership.id),
        headers=admin_headers,
        json={"access": "organiser", "reason": REASON},
    )
    assert response.status_code == 409
    assert await _live_bundles(db_async, membership.id) == set()
    assert not await _has_app_role(db_async, user)


async def test_an_owner_only_gets_the_sign_in_role(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org, user, membership = await _member(db_async)
    membership.role = MembershipRole.OWNER.value
    await db_async.commit()

    refused = await async_client.put(
        _put(org.id, membership.id),
        headers=admin_headers,
        json={"access": "none", "reason": REASON},
    )
    given = await async_client.put(
        _put(org.id, membership.id),
        headers=admin_headers,
        json={"access": "organiser", "reason": REASON},
    )

    assert refused.status_code == 409
    assert given.status_code == 200
    assert given.json()["full_access"] is True
    assert await _live_bundles(db_async, membership.id) == set()
    assert await _has_app_role(db_async, user)


async def test_a_member_of_another_organisation_is_not_found(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org, _, _ = await _member(db_async)
    _, _, other = await _member(db_async)
    response = await async_client.put(
        _put(org.id, other.id),
        headers=admin_headers,
        json={"access": "organiser", "reason": REASON},
    )
    assert response.status_code == 404


async def test_every_change_is_audited_with_the_reason(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org, user, membership = await _member(db_async)
    await async_client.put(
        _put(org.id, membership.id),
        headers=admin_headers,
        json={"access": "organiser", "reason": REASON},
    )
    entry = await db_async.scalar(
        select(AuditEntry).where(
            AuditEntry.record_type == "platform_organisation_member",
            AuditEntry.record_id == membership.id,
            AuditEntry.action == "printix_access",
        )
    )
    assert entry is not None
    assert entry.actor_user_id is not None
    assert entry.organisation_id == org.id
    assert REASON in str(entry.changes)
    assert str(user.id) in str(entry.changes)
    grant_entry = await db_async.scalar(
        select(AuditEntry).where(
            AuditEntry.record_type == "organisation_membership_grant",
            AuditEntry.organisation_id == org.id,
        )
    )
    assert grant_entry is not None
    assert grant_entry.actor_user_id == entry.actor_user_id


# --- Listing and adding -----------------------------------------------------------


async def test_the_list_shows_access_and_sign_in(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org, user, membership = await _member(db_async)
    other = await make_user(db_async)
    await make_org_member(db_async, org, other)
    await async_client.put(
        _put(org.id, membership.id),
        headers=admin_headers,
        json={"access": "gate_lead", "reason": REASON},
    )

    response = await async_client.get(f"{BASE}/{org.id}/members", headers=admin_headers)

    assert response.status_code == 200
    body = response.json()
    assert body["entitled"] is True
    by_id = {row["user_id"]: row for row in body["data"]}
    assert by_id[str(user.id)]["access"] == "gate_lead"
    assert by_id[str(user.id)]["can_sign_in"] is True
    assert by_id[str(other.id)]["access"] == "none"
    assert by_id[str(other.id)]["can_sign_in"] is False


async def test_adding_by_email_joins_grants_and_audits(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org = await make_org(db_async, f"Org {uuid.uuid4().hex[:6]}", apps=("printix",))
    user = await make_user(db_async)

    response = await async_client.post(
        f"{BASE}/{org.id}/members",
        headers=admin_headers,
        json={"email": user.email, "access": "organiser", "reason": REASON},
    )

    assert response.status_code == 201
    assert response.json()["access"] == "organiser"
    membership = await db_async.scalar(
        select(Membership).where(
            Membership.organisation_id == org.id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    assert membership.role == MembershipRole.MEMBER.value
    assert await _live_bundles(db_async, membership.id) == {"printix-organiser"}
    assert await _has_app_role(db_async, user)
    actions = set(
        (
            await db_async.scalars(
                select(AuditEntry.action).where(
                    AuditEntry.record_type == "platform_organisation_member",
                    AuditEntry.organisation_id == org.id,
                )
            )
        ).all()
    )
    assert actions == {"add", "printix_access"}


async def test_adding_an_email_with_no_account_is_refused(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org = await make_org(db_async, f"Org {uuid.uuid4().hex[:6]}", apps=("printix",))
    response = await async_client.post(
        f"{BASE}/{org.id}/members",
        headers=admin_headers,
        json={"email": "nobody@example.com", "access": "organiser", "reason": REASON},
    )
    assert response.status_code == 404


async def test_adding_to_an_organisation_without_printix_adds_nobody(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org = await make_org(db_async, f"Org {uuid.uuid4().hex[:6]}")
    user = await make_user(db_async)
    response = await async_client.post(
        f"{BASE}/{org.id}/members",
        headers=admin_headers,
        json={"email": user.email, "access": "gate_lead", "reason": REASON},
    )
    assert response.status_code == 409
    assert (
        await db_async.scalar(
            select(Membership.id).where(Membership.user_id == user.id)
        )
        is None
    )


async def test_adding_an_existing_member_is_a_conflict(
    async_client: httpx.AsyncClient,
    admin_headers: dict[str, str],
    db_async: AsyncSession,
) -> None:
    org, user, _ = await _member(db_async)
    response = await async_client.post(
        f"{BASE}/{org.id}/members",
        headers=admin_headers,
        json={"email": user.email, "access": "organiser", "reason": REASON},
    )
    assert response.status_code == 409
