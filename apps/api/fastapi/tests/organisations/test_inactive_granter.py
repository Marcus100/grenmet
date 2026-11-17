"""A grant whose granter is no longer an active member pauses (issue #1501).

Owner decision: access given by a suspended admin pauses until they are reinstated.
``grants.effective_keys`` already ignores such grants (#1496). This file covers the two
places that still counted them:

* ``_expiry_ceiling``: a grantor may not pass on access that outlasts their own keys,
  and a grant from an inactive granter must not lengthen those keys.
* The team listings (roster, a member's grants, a member's issued grants): the grant is
  listed with ``active: false`` and ``inactive_reason: "granter_inactive"``, so the team
  page never shows a live grant that gives no access.
"""

from datetime import timedelta

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.organisations import grants, service
from src.organisations.dependencies import OrgContext
from src.organisations.exceptions import GrantExpiryExceedsGrantorError
from src.organisations.models import Membership, MembershipRole, MembershipStatus
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/organisations/org"
TEAM = f"{API}/team"


async def _membership(db: AsyncSession, org_id: str, user) -> Membership:
    return (
        await db.execute(
            select(Membership)
            .where(Membership.organisation_id == org_id, Membership.user_id == user.id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()


async def _context(db: AsyncSession, user, org) -> OrgContext:
    resolved = await service.resolve_membership(
        db, user_id=user.id, organisation_id=org.id
    )
    return OrgContext(
        organisation=resolved.organisation, membership=resolved.membership, user=user
    )


async def _context_for(db: AsyncSession, user_id, organisation_id: str) -> OrgContext:
    """Like ``_context`` but from ids, for use after a rollback has expired objects."""
    user = await db.get(User, user_id)
    assert user is not None
    resolved = await service.resolve_membership(
        db, user_id=user_id, organisation_id=organisation_id
    )
    return OrgContext(
        organisation=resolved.organisation, membership=resolved.membership, user=user
    )


async def _grant(db: AsyncSession, grantor, org, target, role_key: str, **kw):
    context = await _context(db, grantor, org)
    target_row = await _membership(db, org.id, target)
    row = await grants.grant_role(
        db, context, membership_id=target_row.id, role_key=role_key, **kw
    )
    await db.commit()
    return row


async def _remove(db: AsyncSession, org, user) -> None:
    """The granter stops being an active member; their grants stay live (a stale row,
    as left by a suspension or by a removal that did not end them)."""
    row = await _membership(db, org.id, user)
    row.status = MembershipStatus.REMOVED.value
    await db.commit()


# ── 1. The ceiling ─────────────────────────────────────────────────────────


async def test_ceiling_ignores_a_grant_from_an_inactive_granter(db_async: AsyncSession):
    """The lead passes on tickets.sell. Their live access to it is events-manager from
    the owner, which ends in a day. A permanent events-till from an admin who is no
    longer a member also gives tickets.sell, but gives no access, so it must not lift
    the ceiling: a permanent grant is refused and one inside the day is allowed."""
    owner = await make_user(db_async)
    gone_admin = await make_user(db_async)
    lead = await make_user(db_async)
    other = await make_user(db_async)
    org = await make_org(
        db_async,
        "Ceiling inactive granter",
        members=(
            (owner, MembershipRole.OWNER),
            (gone_admin, MembershipRole.ADMIN),
            (lead, MembershipRole.MEMBER),
            (other, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    soon = utc_now() + timedelta(days=1)
    await _grant(db_async, owner, org, lead, "events-team")
    await _grant(db_async, owner, org, lead, "events-manager", expires_at=soon)
    await _grant(db_async, gone_admin, org, lead, "events-till")
    await _remove(db_async, org, gone_admin)
    # Ids only from here: the rollback below expires every loaded object.
    lead_id, org_id = lead.id, org.id
    other_membership_id = (await _membership(db_async, org_id, other)).id

    lead_context = await _context_for(db_async, lead_id, org_id)
    assert "events.tickets.sell" in await grants.effective_keys(
        db_async, membership=lead_context.membership
    )
    with pytest.raises(GrantExpiryExceedsGrantorError):
        await grants.grant_role(
            db_async,
            lead_context,
            membership_id=other_membership_id,
            role_key="events-till",
        )
    await db_async.rollback()

    # Inside the day the lead's own tickets.sell ends: allowed.
    lead_context = await _context_for(db_async, lead_id, org_id)
    within = soon - timedelta(hours=1)
    granted = await grants.grant_role(
        db_async,
        lead_context,
        membership_id=other_membership_id,
        role_key="events-till",
        expires_at=within,
    )
    await db_async.commit()
    assert granted.expires_at == within.replace(tzinfo=None)


# ── 2. The listings ────────────────────────────────────────────────────────


async def _world(db: AsyncSession):
    """Owner grants lead events-team (team manager). The lead also holds events-door
    from an admin who is no longer a member, so that grant is inactive."""
    owner = await make_user(db)
    gone_admin = await make_user(db)
    lead = await make_user(db)
    other = await make_user(db)
    org = await make_org(
        db,
        "Listings inactive granter",
        members=(
            (owner, MembershipRole.OWNER),
            (gone_admin, MembershipRole.ADMIN),
            (lead, MembershipRole.MEMBER),
            (other, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    await _grant(db, owner, org, lead, "events-team")
    await _grant(db, gone_admin, org, lead, "events-door")
    await _grant(db, owner, org, other, "events-till")
    await _remove(db, org, gone_admin)
    return owner, gone_admin, lead, other, org


def _by_role(grant_rows: list[dict]) -> dict[str, dict]:
    return {g["role_key"]: g for g in grant_rows}


async def test_roster_marks_a_grant_from_an_inactive_granter(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, lead, _, org = await _world(db_async)
    lead_row = await _membership(db_async, org.id, lead)

    response = await async_client.get(
        f"{TEAM}/members", headers=headers_for(owner, org.id)
    )

    assert response.status_code == 200
    rows = {m["membership_id"]: m for m in response.json()["data"]}
    lead_grants = _by_role(rows[lead_row.id]["grants"])
    assert lead_grants["events-door"]["active"] is False
    assert lead_grants["events-door"]["inactive_reason"] == "granter_inactive"
    assert lead_grants["events-team"]["active"] is True
    assert lead_grants["events-team"]["inactive_reason"] is None


async def test_member_grants_list_marks_a_grant_from_an_inactive_granter(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, lead, _, org = await _world(db_async)
    lead_row = await _membership(db_async, org.id, lead)

    response = await async_client.get(
        f"{API}/members/{lead_row.id}/grants", headers=headers_for(owner, org.id)
    )

    assert response.status_code == 200
    by_role = _by_role(response.json())
    assert by_role["events-door"]["active"] is False
    assert by_role["events-door"]["inactive_reason"] == "granter_inactive"
    assert by_role["events-team"]["active"] is True


async def test_issued_grants_of_a_removed_admin_are_marked_inactive(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, gone_admin, _, _, org = await _world(db_async)
    gone_row = await _membership(db_async, org.id, gone_admin)

    response = await async_client.get(
        f"{API}/members/{gone_row.id}/issued-grants",
        headers=headers_for(owner, org.id),
    )

    assert response.status_code == 200
    issued = response.json()
    assert [g["role_key"] for g in issued] == ["events-door"]
    assert issued[0]["active"] is False
    assert issued[0]["inactive_reason"] == "granter_inactive"


async def test_grant_from_an_active_granter_is_listed_as_active(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner, _, _, other, org = await _world(db_async)
    other_row = await _membership(db_async, org.id, other)

    response = await async_client.get(
        f"{API}/members/{other_row.id}/grants", headers=headers_for(owner, org.id)
    )

    assert response.status_code == 200
    (only,) = response.json()
    assert only["role_key"] == "events-till"
    assert only["active"] is True
    assert only["inactive_reason"] is None
