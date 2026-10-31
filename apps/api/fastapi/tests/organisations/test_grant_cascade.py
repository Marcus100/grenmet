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
from src.organisations.exceptions import GrantCascadeTooLargeError, GrantNotHeldError
from src.organisations.members import apply_removal, apply_role_change
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    MembershipStatus,
)
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import headers_for, make_org

API = "/api/v1/organisations/org"
ORG_API = "/api/v1/organisations"
CASCADE = "revoke_cascade"


async def _users(db: AsyncSession, count: int) -> list:
    return [await make_user(db) for _ in range(count)]


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


async def _org(db: AsyncSession, name: str, roles, apps=("events",)):
    return await make_org(db, name, members=roles, apps=apps)


async def test_a_chain_is_revoked_from_the_top_with_root_audit(db_async: AsyncSession):
    owner = await make_user(db_async)
    m1, m2, m3 = await _users(db_async, 3)
    org = await _org(
        db_async,
        "Chain",
        (
            (owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
            (m3, MembershipRole.MEMBER),
        ),
    )
    g1 = await _grant(db_async, owner, org, m1, "events-team")
    g2 = await _grant(db_async, m1, org, m2, "events-team")
    g3 = await _grant(db_async, m2, org, m3, "events-team")

    await _revoke(db_async, owner, org, g1)

    assert [await _is_live(db_async, g) for g in (g1, g2, g3)] == [False, False, False]
    entries = await _cascade_entries(db_async, org)
    assert {e.record_id for e in entries} == {g2.id, g3.id}
    assert all(e.actor_user_id == owner.id for e in entries)
    assert {_field(e, "root") for e in entries} == {g1.id}
    assert {_field(e, "trigger") for e in entries} == {"grant_revoked"}


async def test_mutual_support_with_no_root_is_revoked(db_async: AsyncSession):
    """A and B back each other's grants. Once the owner's grant to A ends, neither
    chain reaches an owner or admin, so both loops of grants end."""
    owner = await make_user(db_async)
    a, b = await _users(db_async, 2)
    org = await _org(
        db_async,
        "Loop",
        (
            (owner, MembershipRole.OWNER),
            (a, MembershipRole.MEMBER),
            (b, MembershipRole.MEMBER),
        ),
    )
    to_a = await _grant(db_async, owner, org, a, "events-team")
    to_b = await _grant(db_async, owner, org, b, "events-door")
    a_to_b = await _grant(db_async, a, org, b, "events-team")
    b_to_a = await _grant(db_async, b, org, a, "events-door")

    await _revoke(db_async, owner, org, to_a)

    assert await _is_live(db_async, to_a) is False
    assert await _is_live(db_async, a_to_b) is False
    assert await _is_live(db_async, b_to_a) is False
    # The owner's grant to B has its own root and stays.
    assert await _is_live(db_async, to_b) is True


async def test_grants_that_do_not_depend_on_the_revoked_one_survive(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    m1, m2, m3, m4 = await _users(db_async, 4)
    org = await _org(
        db_async,
        "Unrelated",
        (
            (owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
            (m3, MembershipRole.MEMBER),
            (m4, MembershipRole.MEMBER),
        ),
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


async def test_expiring_cover_is_not_counted_once_it_lapses(db_async: AsyncSession):
    """The cover for m1's grant to m2 lapses. Its grant to m2 no longer has a supported
    chain, so the next explicit revoke that reaches m1 ends it."""
    from datetime import timedelta

    owner = await make_user(db_async)
    m1, m2 = await _users(db_async, 2)
    org = await _org(
        db_async,
        "Lapse",
        (
            (owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
        ),
    )
    cover = await _grant(db_async, owner, org, m1, "events-team")
    dependent = await _grant(db_async, m1, org, m2, "events-team")
    root = await _grant(db_async, owner, org, m1, "events-till")
    cover.expires_at = utc_now() - timedelta(minutes=1)
    await db_async.commit()

    await _revoke(db_async, owner, org, root)

    assert await _is_live(db_async, dependent) is False
    assert {_field(e, "root") for e in await _cascade_entries(db_async, org)} == {
        root.id
    }


async def test_entitlements_do_not_change_coverage(db_async: AsyncSession):
    """Coverage is computed by reachability from owner and admin roots, ignoring
    entitlements. The same org's chains are judged the same with the product off."""
    from src.organisations import service as org_service

    owner = await make_user(db_async)
    admin = await make_user(db_async)
    m1, m2, m3 = await _users(db_async, 3)
    org = await _org(
        db_async,
        "Entitlements",
        (
            (owner, MembershipRole.OWNER),
            (admin, MembershipRole.ADMIN),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
            (m3, MembershipRole.MEMBER),
        ),
    )
    await _grant(db_async, admin, org, m1, "events-team")
    via_admin = await _grant(db_async, m1, org, m2, "events-team")
    owner_door = await _grant(db_async, owner, org, m3, "events-door")
    await org_service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="events", enabled=False
    )
    await db_async.commit()

    members = await grants._active_members(db_async, org.id)
    live = await grants._live_grants(db_async, org.id, utc_now())
    supported = grants._supported_grant_ids(members, live)

    assert via_admin.id in supported
    assert owner_door.id in supported


async def test_demoting_an_admin_ends_all_grants_it_issued_transitively(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    admin = await make_user(db_async)
    m1, m2, m3 = await _users(db_async, 3)
    org = await _org(
        db_async,
        "Demotion",
        (
            (owner, MembershipRole.OWNER),
            (admin, MembershipRole.ADMIN),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
            (m3, MembershipRole.MEMBER),
        ),
    )
    admin_to_m1 = await _grant(db_async, admin, org, m1, "events-team")
    m1_to_m2 = await _grant(db_async, m1, org, m2, "events-team")
    m2_to_m3 = await _grant(db_async, m2, org, m3, "events-team")
    admin_mid = (await _membership(db_async, org.id, admin)).id

    demoted = await async_client.patch(
        f"{ORG_API}/{org.id}/members/{admin_mid}",
        json={"role": "member"},
        headers=headers_for(owner, org.id),
    )

    assert demoted.status_code == 200
    assert [await _is_live(db_async, g) for g in (admin_to_m1, m1_to_m2, m2_to_m3)] == [
        False,
        False,
        False,
    ]
    entries = await _cascade_entries(db_async, org)
    assert {e.record_id for e in entries} == {m1_to_m2.id, m2_to_m3.id}
    assert {_field(e, "trigger") for e in entries} == {"demoted"}


async def test_demotion_stops_at_owners_and_admins(db_async: AsyncSession):
    """An admin demoted to member loses what they issued, but a grant issued by another
    admin is their own and stays, including what that admin passed on."""
    owner = await make_user(db_async)
    admin = await make_user(db_async)
    other_admin = await make_user(db_async)
    member = await make_user(db_async)
    org = await _org(
        db_async,
        "Admins",
        (
            (owner, MembershipRole.OWNER),
            (admin, MembershipRole.ADMIN),
            (other_admin, MembershipRole.ADMIN),
            (member, MembershipRole.MEMBER),
        ),
    )
    admin_to_other = await _grant(db_async, admin, org, other_admin, "events-team")
    other_to_member = await _grant(db_async, other_admin, org, member, "events-door")
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

    assert await _is_live(db_async, admin_to_other) is False
    assert await _is_live(db_async, other_to_member) is True


async def test_removing_an_issuer_cascades_down_the_chain(db_async: AsyncSession):
    owner = await make_user(db_async)
    m1, m2, m3 = await _users(db_async, 3)
    org = await _org(
        db_async,
        "Removal",
        (
            (owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
            (m3, MembershipRole.MEMBER),
        ),
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


async def test_revoke_route_returns_the_cascade_count(
    async_client: httpx.AsyncClient, db_async: AsyncSession
):
    owner = await make_user(db_async)
    m1, m2 = await _users(db_async, 2)
    org = await _org(
        db_async,
        "Route",
        (
            (owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
        ),
    )
    owner_to_m1 = await _grant(db_async, owner, org, m1, "events-team")
    m1_to_m2 = await _grant(db_async, m1, org, m2, "events-team")

    response = await async_client.post(
        f"{API}/grants/{owner_to_m1.id}/revoke",
        headers=headers_for(owner, org.id),
    )

    assert response.status_code == 200
    assert response.json()["cascaded_revocations"] == 1
    assert await _is_live(db_async, m1_to_m2) is False
    entries = await _cascade_entries(db_async, org)
    assert [e.record_id for e in entries] == [m1_to_m2.id]
    assert entries[0].actor_user_id == owner.id


async def test_a_revoker_removed_before_the_lock_is_refused(db_async: AsyncSession):
    """The caller's membership was read before the revoke, then removed. The stale
    context must not revoke anything."""
    owner = await make_user(db_async)
    other_owner = await make_user(db_async)
    m1 = await make_user(db_async)
    org = await _org(
        db_async,
        "Stale",
        (
            (owner, MembershipRole.OWNER),
            (other_owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
        ),
    )
    grant_row = await _grant(db_async, owner, org, m1, "events-team")
    stale = await _context(db_async, other_owner, org)
    removed = await _membership(db_async, org.id, other_owner)
    removed.status = MembershipStatus.REMOVED.value
    await db_async.commit()

    with pytest.raises(GrantNotHeldError):
        await grants.revoke_grant(db_async, stale, grant_id=grant_row.id)
    await db_async.rollback()
    assert await _is_live(db_async, grant_row) is True


async def test_the_cascade_is_bounded(db_async: AsyncSession, monkeypatch):
    monkeypatch.setattr(grants, "MAX_CASCADE_GRANTS", 1)
    owner = await make_user(db_async)
    m1, m2, m3 = await _users(db_async, 3)
    org = await _org(
        db_async,
        "Bound",
        (
            (owner, MembershipRole.OWNER),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
            (m3, MembershipRole.MEMBER),
        ),
    )
    root = await _grant(db_async, owner, org, m1, "events-team")
    await _grant(db_async, m1, org, m2, "events-team")
    await _grant(db_async, m2, org, m3, "events-team")

    context = await _context(db_async, owner, org)
    with pytest.raises(GrantCascadeTooLargeError):
        await grants.revoke_grant(db_async, context, grant_id=root.id)
    await db_async.rollback()
    assert await _is_live(db_async, root) is True


async def test_cross_organisation_cascade_stays_inside_its_organisation(
    db_async: AsyncSession,
):
    owner_one = await make_user(db_async)
    owner_two = await make_user(db_async)
    shared = await make_user(db_async)
    peer_one = await make_user(db_async)
    peer_two = await make_user(db_async)
    org_one = await _org(
        db_async,
        "One",
        (
            (owner_one, MembershipRole.OWNER),
            (shared, MembershipRole.MEMBER),
            (peer_one, MembershipRole.MEMBER),
        ),
    )
    org_two = await _org(
        db_async,
        "Two",
        (
            (owner_two, MembershipRole.OWNER),
            (shared, MembershipRole.MEMBER),
            (peer_two, MembershipRole.MEMBER),
        ),
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
