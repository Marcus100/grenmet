"""Member removal scope (owner decision, 2026-10-30; issue #815).

``DELETE /organisations/{id}/members/{membership_id}``: an account session removes the
person from the whole organisation (204). An Events app session only ends that
person's Events access in that organisation (200, ``scope: events``): their live
``events-*`` grants there and the grants they issued for Events there. The membership,
other products, other organisations and the account-level Events opt-in stay. Last-owner and owner-touch rules hold on both paths, and the
audit entries say which sign-in made the change.
"""

import uuid
from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.config import auth_settings
from src.auth.models import Role, UserRoleLink
from src.auth.utils import create_access_token
from src.organisations import service
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    MembershipStatus,
    new_grant_id,
)
from tests.events.roles import user_with_role
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/organisations"


def _app_headers(user, org_id: str, app: str) -> dict[str, str]:
    token = create_access_token(
        user.id,
        timedelta(minutes=auth_settings.ACCESS_TOKEN_EXPIRE_MINUTES),
        app=app,
    )
    return {"Authorization": f"Bearer {token}", "X-Barrels-Organisation": org_id}


async def _membership(db: AsyncSession, org_id: str, user_id) -> Membership:
    return (
        await db.execute(
            select(Membership)
            .where(Membership.organisation_id == org_id, Membership.user_id == user_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _grant(
    db: AsyncSession,
    *,
    membership: Membership,
    role_key: str,
    granted_by,
) -> str:
    row = MembershipGrant(
        id=new_grant_id(),
        membership_id=membership.id,
        organisation_id=membership.organisation_id,
        role_key=role_key,
        granted_by=granted_by,
    )
    db.add(row)
    await db.commit()
    return row.id


async def _grant_row(db: AsyncSession, grant_id: str) -> MembershipGrant:
    return (
        await db.execute(
            select(MembershipGrant)
            .where(MembershipGrant.id == grant_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _has_events_opt_in(db: AsyncSession, user_id) -> bool:
    role_id = await db.scalar(select(Role.id).where(Role.name == "events-member"))
    link = await db.scalar(
        select(UserRoleLink).where(
            UserRoleLink.user_id == user_id, UserRoleLink.role_id == role_id
        )
    )
    return link is not None


async def _join_events(db: AsyncSession, user) -> None:
    """The Events opt-in as Join writes it: a plain role link (``ensure_member``)."""
    role_id = await db.scalar(select(Role.id).where(Role.name == "events-member"))
    db.add(UserRoleLink(user_id=user.id, role_id=role_id))
    await db.commit()


async def _world(db: AsyncSession, *, target_events_role: bool = True):
    """An owner and a member holding an Events grant and a Bookings grant.

    Grants are written as rows: the Bookings bundles arrive with ADR-0044 S4, so the
    grant service cannot create one yet. The Events grant is only a row too, which
    keeps the setup independent of the grant rules this test is not about."""
    owner = await user_with_role(db, "events-member")
    target = await user_with_role(db, None)
    if target_events_role:
        await _join_events(db, target)
    org = await make_org(
        db,
        "Venue",
        members=((owner, MembershipRole.OWNER), (target, MembershipRole.MEMBER)),
        apps=("events", "bookings"),
    )
    target_row = await _membership(db, org.id, target.id)
    events_grant = await _grant(
        db,
        membership=target_row,
        role_key="events-door",
        granted_by=owner.id,
    )
    bookings_grant = await _grant(
        db,
        membership=target_row,
        role_key="bookings-agenda",
        granted_by=owner.id,
    )
    return owner, target, org, target_row, events_grant, bookings_grant


async def test_events_session_removal_only_ends_events_access(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, target, org, row, events_grant, bookings_grant = await _world(db_async)

    response = await async_client.delete(
        f"{API}/{org.id}/members/{row.id}",
        headers=_app_headers(owner, org.id, "events"),
    )

    assert response.status_code == 200, response.text
    assert response.json() == {
        "membership_id": row.id,
        "scope": "events",
        "grants_revoked": 1,
        "issued_grants_revoked": 0,
    }
    kept = await _membership(db_async, org.id, target.id)
    assert kept.status == MembershipStatus.ACTIVE.value
    assert (await _grant_row(db_async, events_grant)).revoked_at is not None
    assert (await _grant_row(db_async, bookings_grant)).revoked_at is None


async def test_events_removal_keeps_the_account_opt_in_and_other_organisations(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    """Removal from one organisation's Events team must not lock the person out
    of Events elsewhere: the account-level Join link and the second organisation
    stay as they were."""
    owner, target, org, row, _, _ = await _world(db_async)
    second = await make_org(
        db_async,
        "Second venue",
        members=((owner, MembershipRole.OWNER), (target, MembershipRole.MEMBER)),
        apps=("events",),
    )
    second_row = await _membership(db_async, second.id, target.id)
    second_grant = await _grant(
        db_async,
        membership=second_row,
        role_key="events-till",
        granted_by=owner.id,
    )

    before = await async_client.get(
        f"{API}/org/team/me", headers=_app_headers(target, org.id, "events")
    )
    assert before.status_code == 200, before.text

    response = await async_client.delete(
        f"{API}/{org.id}/members/{row.id}",
        headers=_app_headers(owner, org.id, "events"),
    )
    assert response.status_code == 200, response.text

    assert await _has_events_opt_in(db_async, target.id) is True
    # Still signs in to Events, and still a member of the second organisation.
    elsewhere = await async_client.get(
        f"{API}/org/team/me", headers=_app_headers(target, second.id, "events")
    )
    assert elsewhere.status_code == 200, elsewhere.text
    assert (await _grant_row(db_async, second_grant)).revoked_at is None
    # The first organisation's membership stays too: only its Events access ended.
    here = await async_client.get(
        f"{API}/org/team/me", headers=_app_headers(target, org.id, "events")
    )
    assert here.status_code == 200, here.text
    assert (await _membership(db_async, org.id, target.id)).status == (
        MembershipStatus.ACTIVE.value
    )


async def test_events_removal_without_an_opt_in_still_ends_the_org_grants(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, org, row, events_grant, bookings_grant = await _world(
        db_async, target_events_role=False
    )

    response = await async_client.delete(
        f"{API}/{org.id}/members/{row.id}",
        headers=_app_headers(owner, org.id, "events"),
    )

    assert response.status_code == 200, response.text
    assert response.json()["grants_revoked"] == 1
    assert (await _grant_row(db_async, events_grant)).revoked_at is not None
    assert (await _grant_row(db_async, bookings_grant)).revoked_at is None


async def test_events_removal_also_ends_events_grants_the_person_issued(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, target, org, row, _, bookings_grant = await _world(db_async)
    other = await make_user(db_async)
    other_row = await service.add_member(
        db_async,
        organisation_id=org.id,
        user_id=other.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()
    issued_events = await _grant(
        db_async,
        membership=other_row,
        role_key="events-till",
        granted_by=target.id,
    )
    issued_bookings = await _grant(
        db_async,
        membership=other_row,
        role_key="bookings-agenda",
        granted_by=target.id,
    )

    response = await async_client.delete(
        f"{API}/{org.id}/members/{row.id}",
        headers=_app_headers(owner, org.id, "events"),
    )

    assert response.status_code == 200, response.text
    assert response.json()["issued_grants_revoked"] == 1
    assert (await _grant_row(db_async, issued_events)).revoked_at is not None
    assert (await _grant_row(db_async, issued_bookings)).revoked_at is None
    assert (await _grant_row(db_async, bookings_grant)).revoked_at is None


async def test_account_removal_removes_the_membership_from_the_organisation(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, target, org, row, events_grant, bookings_grant = await _world(db_async)

    response = await async_client.delete(
        f"{API}/{org.id}/members/{row.id}", headers=headers_for(owner, org.id)
    )

    assert response.status_code == 204, response.text
    gone = await _membership(db_async, org.id, target.id)
    assert gone.status == MembershipStatus.REMOVED.value
    assert (await _grant_row(db_async, events_grant)).revoked_at is not None
    assert (await _grant_row(db_async, bookings_grant)).revoked_at is not None


@pytest.mark.parametrize("path", ["account", "events"])
async def test_last_owner_is_protected_on_both_paths(
    async_client: httpx.AsyncClient, db_async: AsyncSession, path: str
):
    owner = await user_with_role(db_async, "events-member")
    org = await make_org(
        db_async,
        "Solo",
        members=((owner, MembershipRole.OWNER),),
        apps=("events",),
    )
    row = await _membership(db_async, org.id, owner.id)
    headers = (
        headers_for(owner, org.id)
        if path == "account"
        else _app_headers(owner, org.id, "events")
    )

    response = await async_client.delete(
        f"{API}/{org.id}/members/{row.id}", headers=headers
    )

    assert response.status_code == 409, response.text
    assert (
        await _membership(db_async, org.id, owner.id)
    ).status == MembershipStatus.ACTIVE.value


@pytest.mark.parametrize("path", ["account", "events"])
async def test_admin_cannot_remove_or_scope_down_an_owner_on_either_path(
    async_client: httpx.AsyncClient, db_async: AsyncSession, path: str
):
    owner = await user_with_role(db_async, "events-member")
    admin = await user_with_role(db_async, "events-member")
    org = await make_org(
        db_async,
        "Two",
        members=((owner, MembershipRole.OWNER), (admin, MembershipRole.ADMIN)),
        apps=("events",),
    )
    owner_row = await _membership(db_async, org.id, owner.id)
    headers = (
        headers_for(admin, org.id)
        if path == "account"
        else _app_headers(admin, org.id, "events")
    )

    response = await async_client.delete(
        f"{API}/{org.id}/members/{owner_row.id}", headers=headers
    )

    assert response.status_code == 403, response.text
    assert (
        await _membership(db_async, org.id, owner.id)
    ).status == MembershipStatus.ACTIVE.value


async def test_another_apps_session_cannot_remove_anyone(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, target, org, row, events_grant, _ = await _world(db_async)

    response = await async_client.delete(
        f"{API}/{org.id}/members/{row.id}",
        headers=_app_headers(owner, org.id, "bookings"),
    )

    assert response.status_code == 401, response.text
    assert (
        await _membership(db_async, org.id, target.id)
    ).status == MembershipStatus.ACTIVE.value
    assert (await _grant_row(db_async, events_grant)).revoked_at is None


async def test_audit_names_the_sign_in_kind_and_app(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, target, org, row, events_grant, _ = await _world(db_async)
    guest = await make_user(db_async)
    guest_row = await service.add_member(
        db_async,
        organisation_id=org.id,
        user_id=guest.id,
        role=MembershipRole.MEMBER,
    )
    await db_async.commit()

    await async_client.delete(
        f"{API}/{org.id}/members/{row.id}",
        headers=_app_headers(owner, org.id, "events"),
    )
    await async_client.delete(
        f"{API}/{org.id}/members/{guest_row.id}",
        headers=headers_for(owner, org.id),
    )

    events_entries = list(
        (
            await db_async.scalars(
                select(AuditEntry).where(
                    AuditEntry.entity_type == "platform_organisation",
                    AuditEntry.entity_id == org.id,
                    AuditEntry.action == "revoke_events_access",
                )
            )
        ).all()
    )
    assert len(events_entries) == 1
    assert events_entries[0].actor_user_id == owner.id
    assert events_entries[0].actor_session == "app"
    assert events_entries[0].actor_app == "events"

    grant_revoke = await db_async.scalar(
        select(AuditEntry).where(
            AuditEntry.entity_type == "platform_organisation",
            AuditEntry.entity_id == org.id,
            AuditEntry.record_type == "organisation_membership_grant",
            AuditEntry.record_id == events_grant,
            AuditEntry.action == "update",
        )
    )
    assert _revoked_by_events_app(grant_revoke)

    account_removal = await db_async.scalar(
        select(AuditEntry).where(
            AuditEntry.entity_type == "platform_organisation",
            AuditEntry.entity_id == org.id,
            AuditEntry.record_type == "organisation_membership",
            AuditEntry.record_id == guest_row.id,
            AuditEntry.action == "update",
        )
    )
    assert account_removal is not None
    assert account_removal.actor_session == "account"
    assert account_removal.actor_app is None


async def test_grants_made_from_an_events_session_are_audited_as_app_sessions(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, target, org, row, _, _ = await _world(db_async)
    granted = await async_client.post(
        f"{API}/org/members/{row.id}/grants",
        json={"role_key": "events-till"},
        headers=_app_headers(owner, org.id, "events"),
    )
    assert granted.status_code == 201, granted.text

    created = await db_async.scalar(
        select(AuditEntry).where(
            AuditEntry.entity_type == "platform_organisation",
            AuditEntry.entity_id == org.id,
            AuditEntry.record_type == "organisation_membership_grant",
            AuditEntry.record_id == granted.json()["id"],
            AuditEntry.action == "create",
        )
    )
    assert created is not None
    assert created.actor_user_id == owner.id
    assert created.actor_session == "app"
    assert created.actor_app == "events"


def _revoked_by_events_app(entry: AuditEntry | None) -> bool:
    return (
        entry is not None
        and entry.actor_session == "app"
        and entry.actor_app == "events"
        and entry.actor_user_id is not None
    )


async def test_history_endpoint_shows_the_sign_in_of_each_entry(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, target, org, row, _, _ = await _world(db_async)
    await async_client.delete(
        f"{API}/{org.id}/members/{row.id}",
        headers=_app_headers(owner, org.id, "events"),
    )

    response = await async_client.get(
        f"/api/v1/audit/platform_organisation/{org.id}",
        headers=headers_for(owner, org.id),
    )

    assert response.status_code == 200, response.text
    entries = response.json()["data"]
    scoped = [e for e in entries if e["action"] == "revoke_events_access"]
    assert len(scoped) == 1
    assert scoped[0]["actor_session"] == "app"
    assert scoped[0]["actor_app"] == "events"
    assert all(e["actor_session"] in {"account", "app", None} for e in entries)


async def test_remove_member_answers_for_a_missing_membership(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, org, _, _, _ = await _world(db_async)
    response = await async_client.delete(
        f"{API}/{org.id}/members/{uuid.uuid4().hex}",
        headers=_app_headers(owner, org.id, "events"),
    )
    assert response.status_code == 404, response.text
