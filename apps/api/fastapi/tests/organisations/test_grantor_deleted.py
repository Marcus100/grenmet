"""Grants issued by an account that is later anonymised (issue #1496).

Anonymising an account ends its own memberships and grants, and now also every grant
it issued in every organisation, then the grants passed on from those (trigger
``grantor_deleted``, audited with ids only). A grant whose granter is no longer an
active member gives no keys, which also covers rows left by a deletion made before
this fix. A grant with no granter (``granted_by`` NULL) is not touched.
"""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth import service as auth_service
from src.organisations import grants, service
from src.organisations.dependencies import OrgContext
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    MembershipStatus,
    new_grant_id,
)
from src.utils.datetime import utc_now
from tests.factories import make_user
from tests.organisations.support import make_org

CASCADE = "revoke_cascade"


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


async def _orphan(db: AsyncSession, org, target, role_key: str) -> MembershipGrant:
    """A grant with no granter (``granted_by`` NULL), as older fixtures create them."""
    target_row = await _membership(db, org.id, target)
    row = MembershipGrant(
        id=new_grant_id(),
        membership_id=target_row.id,
        organisation_id=org.id,
        role_key=role_key,
        granted_at=utc_now(),
    )
    db.add(row)
    await db.commit()
    return row


async def _is_live(db: AsyncSession, grant: MembershipGrant) -> bool:
    row = (
        await db.execute(
            select(MembershipGrant)
            .where(MembershipGrant.id == grant.id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return row.revoked_at is None


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


def _field(entry: AuditEntry, name: str) -> object:
    return next(c["new"] for c in entry.changes if c["field"] == name)


# ── 1. Deleting the granter ends what they issued ───────────────────────────


async def test_deleted_admin_ends_grants_issued_in_every_organisation(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    admin = await make_user(db_async)
    m1, m2, other, n1 = [await make_user(db_async) for _ in range(4)]
    org_a = await make_org(
        db_async,
        "Grantor A",
        members=(
            (owner, MembershipRole.OWNER),
            (admin, MembershipRole.ADMIN),
            (m1, MembershipRole.MEMBER),
            (m2, MembershipRole.MEMBER),
            (other, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    org_b = await make_org(
        db_async,
        "Grantor B",
        members=(
            (owner, MembershipRole.OWNER),
            (admin, MembershipRole.ADMIN),
            (n1, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    admin_to_m1 = await _grant(db_async, admin, org_a, m1, "events-team")
    m1_to_m2 = await _grant(db_async, m1, org_a, m2, "events-team")
    owner_to_other = await _grant(db_async, owner, org_a, other, "events-door")
    admin_to_n1 = await _grant(db_async, admin, org_b, n1, "events-door")
    orphan = await _orphan(db_async, org_a, other, "events-till")
    admin_membership_a = (await _membership(db_async, org_a.id, admin)).id

    await auth_service.delete_user(session=db_async, user=admin)
    await db_async.commit()

    assert await _is_live(db_async, admin_to_m1) is False
    assert await _is_live(db_async, m1_to_m2) is False
    assert await _is_live(db_async, admin_to_n1) is False
    assert await _is_live(db_async, owner_to_other) is True
    assert await _is_live(db_async, orphan) is True

    entries = await _cascade_entries(db_async, org_a)
    assert {e.record_id for e in entries} == {admin_to_m1.id, m1_to_m2.id}
    assert {_field(e, "trigger") for e in entries} == {"grantor_deleted"}
    assert {_field(e, "root") for e in entries} == {admin_membership_a}
    # Organisation B is audited on its own organisation.
    assert {e.record_id for e in await _cascade_entries(db_async, org_b)} == {
        admin_to_n1.id
    }


async def test_grants_passed_on_to_an_admin_survive_the_granters_deletion(
    db_async: AsyncSession,
):
    """Admins and owners are never traversed as recipients (ADR-0044 S3). The grant
    from the deleted person to an admin ends; the admin's own grant onward stays."""
    admin = await make_user(db_async)  # the account being deleted
    other_admin = await make_user(db_async)
    m = await make_user(db_async)
    org = await make_org(
        db_async,
        "Admin recipient",
        members=(
            (admin, MembershipRole.ADMIN),
            (other_admin, MembershipRole.ADMIN),
            (m, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    to_other_admin = await _grant(db_async, admin, org, other_admin, "events-team")
    admin_to_m = await _grant(db_async, other_admin, org, m, "events-door")

    await auth_service.delete_user(session=db_async, user=admin)
    await db_async.commit()

    assert await _is_live(db_async, to_other_admin) is False
    assert await _is_live(db_async, admin_to_m) is True


async def test_deleting_an_account_that_issued_nothing_ends_no_grants(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    member = await make_user(db_async)
    org = await make_org(
        db_async,
        "No issued grants",
        members=((owner, MembershipRole.OWNER), (member, MembershipRole.MEMBER)),
        apps=("events",),
    )
    received = await _grant(db_async, owner, org, member, "events-door")

    await auth_service.delete_user(session=db_async, user=member)
    await db_async.commit()

    assert await _is_live(db_async, received) is False  # its holder is gone
    assert await _cascade_entries(db_async, org) == []


# ── 2. The key check: a grant from a granter who is no longer a member gives nothing ──


async def test_grant_from_a_removed_granter_gives_no_keys(db_async: AsyncSession):
    owner = await make_user(db_async)
    gone = await make_user(db_async)
    holder = await make_user(db_async)
    org = await make_org(
        db_async,
        "Stale granter",
        members=(
            (owner, MembershipRole.OWNER),
            (gone, MembershipRole.MEMBER),
            (holder, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    stale = await _grant(db_async, owner, org, holder, "events-door")
    # Stale row from before the fix: its granter is removed, the grant is still live.
    gone_row = await _membership(db_async, org.id, gone)
    gone_row.status = MembershipStatus.REMOVED.value
    stale.granted_by = gone.id
    await db_async.commit()
    holder_row = await _membership(db_async, org.id, holder)

    keys = await grants.effective_keys(db_async, membership=holder_row)

    assert "events.door.scan" not in keys


async def test_grant_from_an_active_granter_and_a_grant_without_one_give_keys(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    holder = await make_user(db_async)
    other = await make_user(db_async)
    org = await make_org(
        db_async,
        "Live granter",
        members=(
            (owner, MembershipRole.OWNER),
            (holder, MembershipRole.MEMBER),
            (other, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    await _grant(db_async, owner, org, holder, "events-door")
    await _orphan(db_async, org, other, "events-till")
    holder_row = await _membership(db_async, org.id, holder)
    other_row = await _membership(db_async, org.id, other)

    holder_keys = await grants.effective_keys(db_async, membership=holder_row)
    other_keys = await grants.effective_keys(db_async, membership=other_row)

    assert "events.door.scan" in holder_keys
    assert "events.tickets.sell" in other_keys


async def test_grant_from_an_invited_granter_gives_no_keys(db_async: AsyncSession):
    """Only an active granter counts: a pending member has no authority to pass on."""
    owner = await make_user(db_async)
    pending = await make_user(db_async)
    holder = await make_user(db_async)
    org = await make_org(
        db_async,
        "Pending granter",
        members=(
            (owner, MembershipRole.OWNER),
            (pending, MembershipRole.MEMBER),
            (holder, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    stale = await _grant(db_async, owner, org, holder, "events-door")
    pending_row = await _membership(db_async, org.id, pending)
    pending_row.status = MembershipStatus.INVITED.value
    stale.granted_by = pending.id
    await db_async.commit()
    holder_row = await _membership(db_async, org.id, holder)

    assert "events.door.scan" not in await grants.effective_keys(
        db_async, membership=holder_row
    )
