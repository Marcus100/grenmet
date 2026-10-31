"""Transitive revocation of organisation grants (issue #527, ADR-0044 S3).

Ending a grant, demoting a member or removing one ends the grants the affected
person issued that they no longer hold the keys for, and so on down the chain.
"""

import httpx
import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.organisations import grants, service
from src.organisations.dependencies import OrgContext
from src.organisations.members import apply_removal, apply_role_change
from src.organisations.models import Membership, MembershipGrant, MembershipRole
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/organisations/org"
ORG_API = "/api/v1/organisations"
CASCADE = "revoke_cascade"


async def _users(db: AsyncSession, count: int) -> list:
    return [await make_user(db) for _ in range(count)]


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


async def _grant(
    db: AsyncSession, grantor, org, target, role_key: str
) -> MembershipGrant:
    context = await _context(db, grantor, org)
    target_row = await _membership(db, org.id, target)
    row = await grants.grant_role(
        db, context, membership_id=target_row.id, role_key=role_key
    )
    await db.commit()
    return row


async def _revoke(db: AsyncSession, actor, org, grant: MembershipGrant) -> None:
    context = await _context(db, actor, org)
    await grants.revoke_grant(db, context, grant_id=grant.id)
    await db.commit()


async def _is_live(db: AsyncSession, grant: MembershipGrant) -> bool:
    row = (
        await db.execute(
            select(MembershipGrant)
            .where(MembershipGrant.id == grant.id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return row.revoked_at is None


def _field(entry: AuditEntry, name: str) -> object:
    """The new value a change row recorded for ``name``."""
    return next(c["new"] for c in entry.changes if c["field"] == name)


async def _cascade_entries(db: AsyncSession, org) -> list[AuditEntry]:
    return list(
        (
            await db.scalars(
                select(AuditEntry).where(
                    AuditEntry.entity_id == org.id, AuditEntry.action == CASCADE
                )
            )
        ).all()
    )


async def test_a_chain_is_revoked_from_the_top(db_async: AsyncSession):
    owner = await make_user(db_async)
    m1, m2, m3 = await _users(db_async, 3)
    org = await make_org(
        db_async,
        "Chain",
        members=(
            (owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
            (m3, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    g1 = await _grant(db_async, owner, org, m1, "events-team")
    g2 = await _grant(db_async, m1, org, m2, "events-team")
    g3 = await _grant(db_async, m2, org, m3, "events-team")

    await _revoke(db_async, owner, org, g1)

    assert [await _is_live(db_async, g) for g in (g1, g2, g3)] == [False, False, False]
    entries = await _cascade_entries(db_async, org)
    assert len(entries) == 2
    assert {e.record_id for e in entries} == {g2.id, g3.id}
    assert all(e.actor_user_id == owner.id for e in entries)
    assert {_field(e, "cause") for e in entries} == {"grant_revoked"}


async def test_a_cycle_ends_and_keeps_the_grants_it_does_not_break(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    m1 = await make_user(db_async)
    m2 = await make_user(db_async)
    org = await make_org(
        db_async,
        "Cycle",
        members=(
            (owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    to_m1 = await _grant(db_async, owner, org, m1, "events-team")
    to_m2 = await _grant(db_async, owner, org, m2, "events-door")
    m1_to_m2 = await _grant(db_async, m1, org, m2, "events-team")
    m2_to_m1 = await _grant(db_async, m2, org, m1, "events-door")

    await _revoke(db_async, owner, org, to_m1)

    assert await _is_live(db_async, to_m1) is False
    assert await _is_live(db_async, m1_to_m2) is False
    assert await _is_live(db_async, m2_to_m1) is False
    # The owner's grant to m2 does not depend on m1, so it stays.
    assert await _is_live(db_async, to_m2) is True


async def test_grants_that_do_not_depend_on_the_revoked_one_survive(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    m1, m2, m3, m4 = await _users(db_async, 4)
    org = await make_org(
        db_async,
        "Unrelated",
        members=(
            (owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
            (m3, MembershipRole.MEMBER),
            (m4, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    owner_to_m1 = await _grant(db_async, owner, org, m1, "events-team")
    owner_to_m2 = await _grant(db_async, owner, org, m2, "events-door")
    m1_to_m2 = await _grant(db_async, m1, org, m2, "events-team")
    m2_to_m3 = await _grant(db_async, m2, org, m3, "events-door")
    unrelated = await _grant(db_async, owner, org, m4, "events-till")

    await _revoke(db_async, owner, org, unrelated)

    assert [
        await _is_live(db_async, g)
        for g in (owner_to_m1, owner_to_m2, m1_to_m2, m2_to_m3)
    ] == [True, True, True, True]
    assert await _cascade_entries(db_async, org) == []


@pytest.mark.parametrize("role", [MembershipRole.ADMIN, MembershipRole.OWNER])
async def test_owners_and_admins_keep_the_grants_they_issued(
    db_async: AsyncSession, role: MembershipRole
):
    owner = await make_user(db_async)
    manager = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "Managers",
        members=(
            (owner, MembershipRole.OWNER),
            (manager, role),
            (member, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    # Owners and admins already hold every key, so this grant only adds a duplicate.
    granted_to_manager = await _grant(db_async, owner, org, manager, "events-team")
    manager_to_member = await _grant(db_async, manager, org, member, "events-door")

    await _revoke(db_async, owner, org, granted_to_manager)

    assert await _is_live(db_async, granted_to_manager) is False
    assert await _is_live(db_async, manager_to_member) is True
    assert await _cascade_entries(db_async, org) == []


async def test_demoting_an_admin_revokes_what_they_issued_beyond_their_keys(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    admin = await make_user(db_async)
    m1 = await make_user(db_async)
    m2 = await make_user(db_async)
    org = await make_org(
        db_async,
        "Demotion",
        members=(
            (owner, MembershipRole.OWNER),
            (admin, MembershipRole.ADMIN),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    admin_to_m1 = await _grant(db_async, admin, org, m1, "events-team")
    m1_to_m2 = await _grant(db_async, m1, org, m2, "events-team")
    admin_mid = (await _membership(db_async, org.id, admin)).id

    demoted = await async_client.patch(
        f"{ORG_API}/{org.id}/members/{admin_mid}",
        json={"role": "member"},
        headers=headers_for(owner, org.id),
    )

    assert demoted.status_code == 200
    assert await _is_live(db_async, admin_to_m1) is False
    assert await _is_live(db_async, m1_to_m2) is False
    entries = await _cascade_entries(db_async, org)
    assert {e.record_id for e in entries} == {admin_to_m1.id, m1_to_m2.id}
    assert {_field(e, "cause") for e in entries} == {"role_changed"}


async def test_demotion_keeps_grants_the_member_still_covers(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    admin = await make_user(db_async)
    m1 = await make_user(db_async)
    org = await make_org(
        db_async,
        "Covered",
        members=(
            (owner, MembershipRole.OWNER),
            (admin, MembershipRole.ADMIN),
            (m1, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    # The admin holds the team-manage key through a grant of their own, so their
    # onward grant of the same bundle stays covered once the admin role is gone.
    await _grant(db_async, owner, org, admin, "events-team")
    admin_to_m1 = await _grant(db_async, admin, org, m1, "events-team")
    admin_row = await _membership(db_async, org.id, admin)

    await apply_role_change(
        db_async,
        org.id,
        admin_row.id,
        MembershipRole.MEMBER,
        actor_id=owner.id,
        actor_may_grant_owner=True,
    )
    await db_async.commit()

    assert await _is_live(db_async, admin_to_m1) is True
    assert await _cascade_entries(db_async, org) == []


async def test_removing_an_issuer_cascades_down_the_chain(db_async: AsyncSession):
    owner = await make_user(db_async)
    m1, m2, m3 = await _users(db_async, 3)
    org = await make_org(
        db_async,
        "Removal",
        members=(
            (owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
            (m3, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    await _grant(db_async, owner, org, m1, "events-team")
    m1_to_m2 = await _grant(db_async, m1, org, m2, "events-team")
    m2_to_m3 = await _grant(db_async, m2, org, m3, "events-team")
    m1_row = await _membership(db_async, org.id, m1)

    await apply_removal(
        db_async,
        org.id,
        m1_row.id,
        actor_id=owner.id,
        actor_may_grant_owner=True,
    )
    await db_async.commit()

    assert await _is_live(db_async, m1_to_m2) is False
    assert await _is_live(db_async, m2_to_m3) is False


async def test_grant_revoke_route_cascades_and_audits(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    m1 = await make_user(db_async)
    m2 = await make_user(db_async)
    org = await make_org(
        db_async,
        "Route",
        members=(
            (owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    owner_to_m1 = await _grant(db_async, owner, org, m1, "events-team")
    m1_to_m2 = await _grant(db_async, m1, org, m2, "events-team")

    response = await async_client.post(
        f"{API}/grants/{owner_to_m1.id}/revoke",
        headers=headers_for(owner, org.id),
    )

    assert response.status_code == 200
    assert await _is_live(db_async, m1_to_m2) is False
    entries = await _cascade_entries(db_async, org)
    assert [e.record_id for e in entries] == [m1_to_m2.id]
    assert entries[0].actor_user_id == owner.id


async def test_cascade_never_reaches_another_organisation(db_async: AsyncSession):
    owner_one = await make_user(db_async)
    owner_two = await make_user(db_async)
    shared = await make_user(db_async)
    peer_one = await make_user(db_async)
    peer_two = await make_user(db_async)
    org_one = await make_org(
        db_async,
        "One",
        members=(
            (owner_one, MembershipRole.OWNER),
            (shared, MembershipRole.MEMBER),
            (peer_one, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    org_two = await make_org(
        db_async,
        "Two",
        members=(
            (owner_two, MembershipRole.OWNER),
            (shared, MembershipRole.MEMBER),
            (peer_two, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    granted_one = await _grant(db_async, owner_one, org_one, shared, "events-team")
    shared_to_peer_one = await _grant(
        db_async, shared, org_one, peer_one, "events-team"
    )
    granted_two = await _grant(db_async, owner_two, org_two, shared, "events-team")
    shared_to_peer_two = await _grant(
        db_async, shared, org_two, peer_two, "events-team"
    )

    await _revoke(db_async, owner_one, org_one, granted_one)

    assert await _is_live(db_async, shared_to_peer_one) is False
    assert await _is_live(db_async, granted_two) is True
    assert await _is_live(db_async, shared_to_peer_two) is True
    assert await _cascade_entries(db_async, org_two) == []
