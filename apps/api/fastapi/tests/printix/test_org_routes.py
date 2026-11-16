"""Printix organiser routes, read-only (ADR-0060 organiser amendment).

Every organiser call needs: a printix app session (or an account session, refused
below), an organisation member holding printix.events.manage or printix.gates.manage,
the organisation's printix entitlement, and an authenticator session that passed
the check. Another organisation's event, or one with none, is 404. No superuser
bypass. The administrator list and the event-organisation setter sit beside them.
"""

import uuid
from datetime import timedelta
from typing import Any

import httpx
import pytest
from cryptography.fernet import Fernet
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.auth import totp
from src.auth.config import auth_settings
from src.auth.models import Role, User, UserRoleLink
from src.auth.models import Session as LoginSession
from src.auth.permissions import seed_permissions_and_roles_async
from src.auth.utils import create_access_token
from src.config import settings
from src.organisations import entitlements, grants, role_bundles
from src.organisations import service as org_service
from src.organisations.dependencies import require_org_any_permission
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    PlatformOrganisation,
    new_grant_id,
)
from src.printix.models import PrintixEvent
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

from .support import ADMIN, make_event

ORG = f"{settings.API_V1_STR}/printix/org"

pytestmark = pytest.mark.usefixtures("db_async")


@pytest.fixture(autouse=True)
def _totp_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        auth_settings, "AUTH_TOTP_ENCRYPTION_KEYS", [Fernet.generate_key().decode()]
    )


async def _enrol(db: AsyncSession, user: User) -> None:
    user.totp_secret = totp.encrypt_secret(totp.generate_secret())
    user.totp_enabled = True
    await db.commit()


async def _app_user(db: AsyncSession, *, enrolled: bool = True) -> User:
    """An ordinary account holding the printix-member role (app.printix.access)."""
    await seed_permissions_and_roles_async(db)
    user = await make_user(db)
    role = await db.scalar(select(Role).where(Role.name == "printix-member"))
    assert role is not None
    db.add(UserRoleLink(user_id=user.id, role_id=role.id))
    await db.commit()
    if enrolled:
        await _enrol(db, user)
    return user


async def _grant(
    db: AsyncSession, org: PlatformOrganisation, user: User, role_key: str
) -> None:
    membership = await db.scalar(
        select(Membership).where(
            Membership.organisation_id == org.id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    db.add(
        MembershipGrant(
            id=new_grant_id(),
            membership_id=membership.id,
            organisation_id=org.id,
            role_key=role_key,
            granted_at=utc_now(),
        )
    )
    await db.commit()


async def _sign_in(
    db: AsyncSession,
    user: User,
    *,
    app: str | None = "printix",
    mfa: bool = True,
) -> dict[str, str]:
    """A bearer for a session of ``app`` (None: the account), MFA-verified when ``mfa``."""
    stored, _ = await auth_service.create_session(
        session=db,
        user=user,
        app_name=app,
        enforce_approval=False,
        mfa_verified_at=utc_now() if mfa else None,
    )
    token = create_access_token(
        user.id, timedelta(minutes=5), app=app, session_id=str(stored.id)
    )
    return {"Authorization": f"Bearer {token}"}


async def _organiser(
    db: AsyncSession, org: PlatformOrganisation, role_key: str | None
) -> User:
    """An account with app access, a plain member of ``org``, and ``role_key`` if given."""
    user = await _app_user(db)
    await make_org_member(db, org, user)
    if role_key is not None:
        await _grant(db, org, user, role_key)
    return user


async def make_org_member(
    db: AsyncSession, org: PlatformOrganisation, user: User
) -> Membership:
    await org_service.add_member(
        db, organisation_id=org.id, user_id=user.id, role=MembershipRole.MEMBER
    )
    await db.commit()
    membership = await db.scalar(
        select(Membership).where(
            Membership.organisation_id == org.id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    return membership


async def _org(
    db: AsyncSession, name: str, *, entitled: bool = True
) -> PlatformOrganisation:
    return await make_org(db, name, apps=("printix",) if entitled else ())


async def _event(
    db: AsyncSession, name: str, org: PlatformOrganisation | None
) -> PrintixEvent:
    event = await make_event(db, name=name)
    event.organisation_id = org.id if org is not None else None
    await db.commit()
    return event


@pytest.fixture
async def world(db_async: AsyncSession) -> dict[str, Any]:
    """Two organisations, one event each, and one event with no organisation."""
    org_a = await _org(db_async, f"Printix A {uuid.uuid4().hex[:6]}")
    org_b = await _org(db_async, f"Printix B {uuid.uuid4().hex[:6]}")
    return {
        "org_a": org_a,
        "org_b": org_b,
        "ev_a": await _event(db_async, "Gala A", org_a),
        "ev_b": await _event(db_async, "Gala B", org_b),
        "ev_none": await _event(db_async, "Gala none", None),
    }


def _org_header(org: PlatformOrganisation) -> dict[str, str]:
    return {"X-Barrels-Organisation": org.id}


def _ids(response: httpx.Response) -> set[str]:
    return {item["id"] for item in response.json()["items"]}


# --- Bundles see only their own organisation ---------------------------------


@pytest.mark.parametrize("role_key", ["printix-organiser", "printix-gate-lead"])
async def test_each_bundle_lists_and_summarises_only_its_organisation(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
    role_key: str,
) -> None:
    user = await _organiser(db_async, world["org_a"], role_key)
    headers = {**await _sign_in(db_async, user), **_org_header(world["org_a"])}

    listed = await async_client.get(f"{ORG}/events", headers=headers)
    assert listed.status_code == 200
    assert _ids(listed) == {str(world["ev_a"].id)}
    assert listed.json()["total"] == 1

    summary = await async_client.get(
        f"{ORG}/events/{world['ev_a'].id}/summary", headers=headers
    )
    assert summary.status_code == 200
    assert summary.json()["event"]["id"] == str(world["ev_a"].id)
    assert summary.json()["event"]["organisation_id"] == world["org_a"].id


async def test_another_organisations_event_is_not_found(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], "printix-organiser")
    headers = {**await _sign_in(db_async, user), **_org_header(world["org_a"])}
    response = await async_client.get(
        f"{ORG}/events/{world['ev_b'].id}/summary", headers=headers
    )
    assert response.status_code == 404


async def test_an_event_with_no_organisation_is_invisible_to_organisers(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], "printix-organiser")
    headers = {**await _sign_in(db_async, user), **_org_header(world["org_a"])}
    listed = await async_client.get(f"{ORG}/events", headers=headers)
    assert str(world["ev_none"].id) not in _ids(listed)
    summary = await async_client.get(
        f"{ORG}/events/{world['ev_none'].id}/summary", headers=headers
    )
    assert summary.status_code == 404


async def test_organiser_of_another_organisation_sees_only_theirs(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_b"], "printix-gate-lead")
    headers = {**await _sign_in(db_async, user), **_org_header(world["org_b"])}
    listed = await async_client.get(f"{ORG}/events", headers=headers)
    assert _ids(listed) == {str(world["ev_b"].id)}


# --- Refusals ------------------------------------------------------------------


async def test_a_member_without_a_printix_key_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], None)
    headers = {**await _sign_in(db_async, user), **_org_header(world["org_a"])}
    listed = await async_client.get(f"{ORG}/events", headers=headers)
    summary = await async_client.get(
        f"{ORG}/events/{world['ev_a'].id}/summary", headers=headers
    )
    assert listed.status_code == 403
    assert summary.status_code == 403


async def test_an_organisation_not_entitled_to_printix_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async, f"No Printix {uuid.uuid4().hex[:6]}", entitled=False)
    user = await _organiser(db_async, org, "printix-organiser")
    headers = {**await _sign_in(db_async, user), **_org_header(org)}
    response = await async_client.get(f"{ORG}/events", headers=headers)
    assert response.status_code == 403


async def test_a_non_member_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    outsider = await _app_user(db_async)
    headers = {**await _sign_in(db_async, outsider), **_org_header(world["org_a"])}
    listed = await async_client.get(f"{ORG}/events", headers=headers)
    summary = await async_client.get(
        f"{ORG}/events/{world['ev_a'].id}/summary", headers=headers
    )
    assert listed.status_code == 404
    assert summary.status_code == 404


async def test_a_session_without_the_authenticator_step_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], "printix-organiser")
    headers = {
        **await _sign_in(db_async, user, mfa=False),
        **_org_header(world["org_a"]),
    }
    response = await async_client.get(f"{ORG}/events", headers=headers)
    assert response.status_code == 403
    assert "Sign in again" in response.json()["detail"]


async def test_a_user_without_an_authenticator_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _app_user(db_async, enrolled=False)
    org = world["org_a"]
    await make_org_member(db_async, org, user)
    await _grant(db_async, org, user, "printix-organiser")
    headers = {**await _sign_in(db_async, user), **_org_header(org)}
    response = await async_client.get(f"{ORG}/events", headers=headers)
    # ADR-0061: the app refuses a token whose person has no authenticator, before the
    # organiser membership check (user_for_app), so the stable code is the refusal.
    assert response.status_code == 403
    assert response.json()["code"] == "authenticator_required"
    assert "(" not in response.json()["detail"]


async def test_an_account_session_is_refused_on_organiser_routes(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], "printix-organiser")
    headers = {
        **await _sign_in(db_async, user, app=None),
        **_org_header(world["org_a"]),
    }
    response = await async_client.get(f"{ORG}/events", headers=headers)
    assert response.status_code == 403


async def test_a_token_from_another_app_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], "printix-organiser")
    headers = {
        **await _sign_in(db_async, user, app="events"),
        **_org_header(world["org_a"]),
    }
    response = await async_client.get(f"{ORG}/events", headers=headers)
    assert response.status_code == 401


async def test_a_superuser_without_membership_is_refused(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    superuser = await make_user(db_async, superuser=True)
    await _enrol(db_async, superuser)
    headers = {
        **await _sign_in(db_async, superuser),
        **_org_header(world["org_a"]),
    }
    listed = await async_client.get(f"{ORG}/events", headers=headers)
    assert listed.status_code == 404


async def test_the_organisation_header_is_required(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    user = await _app_user(db_async)
    headers = await _sign_in(db_async, user)
    response = await async_client.get(f"{ORG}/events", headers=headers)
    assert response.status_code == 400


# --- Administrator list and organisation setter ----------------------------------


async def test_the_admin_list_shows_every_event_to_a_superuser(
    async_client: httpx.AsyncClient,
    mfa_admin,
    world: dict[str, Any],
) -> None:
    _, headers = await mfa_admin()
    response = await async_client.get(f"{ADMIN}/events", headers=headers)
    assert response.status_code == 200
    assert _ids(response) >= {
        str(world["ev_a"].id),
        str(world["ev_b"].id),
        str(world["ev_none"].id),
    }


async def test_the_admin_list_is_refused_to_an_organiser(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], "printix-organiser")
    headers = await _sign_in(db_async, user, app=None)
    response = await async_client.get(f"{ADMIN}/events", headers=headers)
    assert response.status_code == 403


async def test_the_admin_sets_and_clears_an_events_organisation(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    mfa_admin,
    world: dict[str, Any],
) -> None:
    _, admin_headers = await mfa_admin()
    organiser = await _organiser(db_async, world["org_b"], "printix-organiser")
    organiser_headers = {
        **await _sign_in(db_async, organiser),
        **_org_header(world["org_b"]),
    }
    event_id = world["ev_none"].id

    moved = await async_client.post(
        f"{ADMIN}/events/{event_id}/organisation",
        headers=admin_headers,
        json={"organisation_id": world["org_b"].id},
    )
    assert moved.status_code == 200
    assert moved.json()["organisation_id"] == world["org_b"].id
    seen = await async_client.get(f"{ORG}/events", headers=organiser_headers)
    assert str(event_id) in _ids(seen)

    cleared = await async_client.post(
        f"{ADMIN}/events/{event_id}/organisation",
        headers=admin_headers,
        json={"organisation_id": None},
    )
    assert cleared.status_code == 200
    assert cleared.json()["organisation_id"] is None
    seen = await async_client.get(f"{ORG}/events", headers=organiser_headers)
    assert str(event_id) not in _ids(seen)


async def test_the_admin_create_takes_an_organisation_and_rejects_an_unknown_one(
    async_client: httpx.AsyncClient,
    mfa_admin,
    world: dict[str, Any],
) -> None:
    _, headers = await mfa_admin()
    body = {
        "name": "Owned gala",
        "event_date": "2026-12-26",
        "closes_at": "2026-12-27T18:00:00Z",
    }
    created = await async_client.post(
        f"{ADMIN}/events",
        headers=headers,
        json={**body, "organisation_id": world["org_a"].id},
    )
    assert created.status_code == 201
    assert created.json()["organisation_id"] == world["org_a"].id

    unknown = await async_client.post(
        f"{ADMIN}/events",
        headers=headers,
        json={**body, "organisation_id": f"org_{uuid.uuid4().hex}"},
    )
    assert unknown.status_code == 422


# --- Keys and registry --------------------------------------------------------


def test_printix_keys_are_organisation_product_keys_and_manage_is_not() -> None:
    assert "printix.events.manage" in grants.product_keys()
    assert "printix.gates.manage" in grants.product_keys()
    assert "printix.manage" not in grants.product_keys()
    assert "app.printix.access" not in grants.product_keys()


def test_bundles_hold_the_printix_keys_and_printix_is_an_entitlement() -> None:
    assert role_bundles.bundle_keys("printix-organiser") == {
        "printix.events.manage",
        "printix.gates.manage",
    }
    assert role_bundles.bundle_keys("printix-gate-lead") == {"printix.gates.manage"}
    assert role_bundles.bundle_copy("printix-gate-lead") == (
        "Gate lead",
        "Make and cancel gate QR codes on event night.",
    )
    assert entitlements.is_known("printix")


def test_either_key_dependency_refuses_keys_from_two_products() -> None:
    with pytest.raises(ValueError):
        require_org_any_permission(("printix.events.manage", "events.door.scan"))
    with pytest.raises(ValueError):
        require_org_any_permission(())


# --- Organisations I can run Printix for (zone me) ---------------------------

ME = f"{settings.API_V1_STR}/printix/me/organisations"


def _listed(response: httpx.Response) -> dict[str, dict[str, Any]]:
    return {item["id"]: item for item in response.json()}


async def test_a_gate_lead_sees_the_organisation_with_gates_only(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], "printix-gate-lead")
    headers = await _sign_in(db_async, user)
    response = await async_client.get(ME, headers=headers)
    assert response.status_code == 200
    listed = _listed(response)
    assert set(listed) == {world["org_a"].id}
    assert listed[world["org_a"].id]["can_manage_events"] is False
    assert listed[world["org_a"].id]["can_manage_gates"] is True
    assert listed[world["org_a"].id]["name"] == world["org_a"].name


async def test_an_organiser_sees_both_keys(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], "printix-organiser")
    headers = await _sign_in(db_async, user)
    listed = _listed(await async_client.get(ME, headers=headers))
    assert listed[world["org_a"].id]["can_manage_events"] is True
    assert listed[world["org_a"].id]["can_manage_gates"] is True


async def test_a_non_member_gets_an_empty_list(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    outsider = await _app_user(db_async)
    response = await async_client.get(ME, headers=await _sign_in(db_async, outsider))
    assert response.status_code == 200
    assert response.json() == []


async def test_a_member_without_a_printix_key_is_not_listed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], None)
    response = await async_client.get(ME, headers=await _sign_in(db_async, user))
    assert response.status_code == 200
    assert response.json() == []


async def test_an_organisation_not_entitled_to_printix_is_not_listed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async, f"No Printix {uuid.uuid4().hex[:6]}", entitled=False)
    user = await _organiser(db_async, org, "printix-organiser")
    response = await async_client.get(ME, headers=await _sign_in(db_async, user))
    assert response.status_code == 200
    assert response.json() == []


async def test_another_apps_token_is_refused_on_the_me_route(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], "printix-organiser")
    response = await async_client.get(
        ME, headers=await _sign_in(db_async, user, app="events")
    )
    assert response.status_code == 401


async def test_a_session_without_the_authenticator_step_is_refused_on_the_me_route(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    user = await _organiser(db_async, world["org_a"], "printix-organiser")
    response = await async_client.get(
        ME, headers=await _sign_in(db_async, user, mfa=False)
    )
    assert response.status_code == 403
    assert "Sign in again" in response.json()["detail"]


# --- Granting the Printix bundles through the team API (blocker fix) --------------

GRANTS_API = f"{settings.API_V1_STR}/organisations/org"


async def _membership_id(
    db: AsyncSession, org: PlatformOrganisation, user: User
) -> str:
    membership = await db.scalar(
        select(Membership).where(
            Membership.organisation_id == org.id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    return membership.id


async def test_an_owner_grants_and_revokes_the_printix_bundles_through_the_team_api(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
) -> None:
    owner = await make_user(db_async)
    org = await make_org(
        db_async,
        f"Printix owned {uuid.uuid4().hex[:6]}",
        members=((owner, MembershipRole.OWNER),),
        apps=("printix",),
    )
    member = await _app_user(db_async)
    await make_org_member(db_async, org, member)
    member_headers = await _sign_in(db_async, member)
    membership_id = await _membership_id(db_async, org, member)
    for bundle in ("printix-organiser", "printix-gate-lead"):
        created = await async_client.post(
            f"{GRANTS_API}/members/{membership_id}/grants",
            headers=headers_for(owner, org.id),
            json={"role_key": bundle},
        )
        assert created.status_code == 201, created.text
        assert created.json()["role_key"] == bundle
        grant_id = created.json()["id"]

        granted = await async_client.get(
            f"{ORG}/events", headers={**member_headers, **_org_header(org)}
        )
        assert granted.status_code == 200, granted.text

        revoked = await async_client.post(
            f"{GRANTS_API}/grants/{grant_id}/revoke",
            headers=headers_for(owner, org.id),
        )
        assert revoked.status_code == 200, revoked.text
        assert revoked.json()["revoked_at"] is not None

        refused = await async_client.get(
            f"{ORG}/events", headers={**member_headers, **_org_header(org)}
        )
        assert refused.status_code == 403


async def test_a_plain_member_cannot_grant_a_printix_bundle(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    org = world["org_a"]
    plain = await _app_user(db_async)
    await make_org_member(db_async, org, plain)
    target = await _app_user(db_async)
    await make_org_member(db_async, org, target)
    response = await async_client.post(
        f"{GRANTS_API}/members/{await _membership_id(db_async, org, target)}/grants",
        headers=headers_for(plain, org.id),
        json={"role_key": "printix-gate-lead"},
    )
    assert response.status_code == 403


# --- set_event_organisation: order and eligibility -------------------------------


async def test_an_unknown_event_is_404_before_the_organisation_is_checked(
    async_client: httpx.AsyncClient,
    mfa_admin,
) -> None:
    _, headers = await mfa_admin()
    response = await async_client.post(
        f"{ADMIN}/events/{uuid.uuid4()}/organisation",
        headers=headers,
        json={"organisation_id": f"org_{uuid.uuid4().hex}"},
    )
    assert response.status_code == 404


async def test_a_suspended_or_unentitled_organisation_cannot_own_an_event(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    mfa_admin,
    world: dict[str, Any],
) -> None:
    _, headers = await mfa_admin()
    suspended = await _org(db_async, f"Suspended {uuid.uuid4().hex[:6]}")
    suspended.status = "suspended"
    unentitled = await _org(db_async, f"Plain {uuid.uuid4().hex[:6]}", entitled=False)
    await db_async.commit()
    event_id = world["ev_none"].id
    for target in (suspended, unentitled):
        response = await async_client.post(
            f"{ADMIN}/events/{event_id}/organisation",
            headers=headers,
            json={"organisation_id": target.id},
        )
        assert response.status_code == 422, response.text
        created = await async_client.post(
            f"{ADMIN}/events",
            headers=headers,
            json={
                "name": "Refused",
                "event_date": "2026-12-26",
                "closes_at": "2026-12-27T18:00:00Z",
                "organisation_id": target.id,
            },
        )
        assert created.status_code == 422, created.text
    await db_async.refresh(world["ev_none"])
    assert world["ev_none"].organisation_id is None


# --- Standing changes take effect at once (org and me routes) --------------------


async def _gate_lead(db: AsyncSession, org: PlatformOrganisation) -> User:
    return await _organiser(db, org, "printix-gate-lead")


async def test_a_suspended_organisation_is_refused_and_not_listed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    org = world["org_a"]
    user = await _gate_lead(db_async, org)
    headers = await _sign_in(db_async, user)
    org.status = "suspended"
    await db_async.commit()
    listed = await async_client.get(
        f"{ORG}/events", headers={**headers, **_org_header(org)}
    )
    assert listed.status_code == 403
    mine = await async_client.get(ME, headers=headers)
    assert mine.status_code == 200
    assert mine.json() == []


async def test_a_removed_membership_is_refused_and_not_listed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    org = world["org_a"]
    user = await _gate_lead(db_async, org)
    headers = await _sign_in(db_async, user)
    membership = await db_async.scalar(
        select(Membership).where(
            Membership.organisation_id == org.id, Membership.user_id == user.id
        )
    )
    assert membership is not None
    membership.status = "removed"
    await db_async.commit()
    listed = await async_client.get(
        f"{ORG}/events", headers={**headers, **_org_header(org)}
    )
    assert listed.status_code == 404
    mine = await async_client.get(ME, headers=headers)
    assert mine.json() == []


async def _set_grant(
    db: AsyncSession, org: PlatformOrganisation, user: User, **changes: Any
) -> None:
    membership_id = await _membership_id(db, org, user)
    grant = await db.scalar(
        select(MembershipGrant).where(MembershipGrant.membership_id == membership_id)
    )
    assert grant is not None
    for name, value in changes.items():
        setattr(grant, name, value)
    await db.commit()


async def test_a_revoked_grant_is_refused_and_not_listed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    org = world["org_a"]
    user = await _gate_lead(db_async, org)
    headers = await _sign_in(db_async, user)
    await _set_grant(db_async, org, user, revoked_at=utc_now())
    listed = await async_client.get(
        f"{ORG}/events", headers={**headers, **_org_header(org)}
    )
    assert listed.status_code == 403
    mine = await async_client.get(ME, headers=headers)
    assert mine.json() == []


async def test_an_expired_grant_is_refused_and_not_listed(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    org = world["org_a"]
    user = await _gate_lead(db_async, org)
    headers = await _sign_in(db_async, user)
    await _set_grant(db_async, org, user, expires_at=utc_now() - timedelta(hours=1))
    listed = await async_client.get(
        f"{ORG}/events", headers={**headers, **_org_header(org)}
    )
    assert listed.status_code == 403
    mine = await async_client.get(ME, headers=headers)
    assert mine.json() == []


async def test_a_revoked_session_is_refused_on_both_zones(
    async_client: httpx.AsyncClient,
    db_async: AsyncSession,
    world: dict[str, Any],
) -> None:
    org = world["org_a"]
    user = await _gate_lead(db_async, org)
    headers = await _sign_in(db_async, user)
    rows = (
        await db_async.scalars(
            select(LoginSession).where(LoginSession.user_id == user.id)
        )
    ).all()
    assert rows
    for row in rows:
        row.revoked_at = utc_now()
    await db_async.commit()
    listed = await async_client.get(
        f"{ORG}/events", headers={**headers, **_org_header(org)}
    )
    assert listed.status_code == 403
    mine = await async_client.get(ME, headers=headers)
    assert mine.status_code == 403
