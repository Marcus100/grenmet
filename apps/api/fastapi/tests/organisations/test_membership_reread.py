"""Acting member re-read after the roster lock, and grants with no granter (issue #1477).

1. Member removal and role change take ``lock_roster`` first. The actor's
   membership was read before that lock, so a concurrent demotion or removal of the
   actor is only visible after it. The change is refused then. The race tests hold the
   lock in a second session, demote or remove the actor there, and only commit after
   the attempt is waiting on the lock.
2. A grant whose granter is gone (``granted_by`` NULL) carries no keys, and the next
   owner or admin cascade in the organisation ends it, audited as ``grantor_deleted``.
"""

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.database import async_session_factory
from src.organisations import grants, members, service
from src.organisations.dependencies import OrgContext
from src.organisations.exceptions import OrganisationRoleError
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    MembershipStatus,
    new_grant_id,
)
from tests.factories import make_user
from tests.organisations.support import make_org

CASCADE = "revoke_cascade"
GRANTOR_GONE = "grantor_deleted"
EVENTS_DOOR_KEY = "events.door.scan"


async def _membership(db: AsyncSession, org_id: str, user_id) -> Membership:
    return (
        await db.execute(
            select(Membership)
            .where(Membership.organisation_id == org_id, Membership.user_id == user_id)
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


async def _grant_row(
    db: AsyncSession, *, membership: Membership, role_key: str, granted_by
) -> MembershipGrant:
    row = MembershipGrant(
        id=new_grant_id(),
        membership_id=membership.id,
        organisation_id=membership.organisation_id,
        role_key=role_key,
        granted_by=granted_by,
    )
    db.add(row)
    await db.commit()
    return row


async def _is_live(db: AsyncSession, grant_id: str) -> bool:
    row = (
        await db.execute(
            select(MembershipGrant)
            .where(MembershipGrant.id == grant_id)
            .execution_options(populate_existing=True)
        )
    ).scalar_one()
    return row.revoked_at is None


async def _status(db: AsyncSession, org_id: str, user_id) -> str:
    return (await _membership(db, org_id, user_id)).status


async def _cascade_entries(db: AsyncSession, org_id: str) -> list[AuditEntry]:
    return list(
        (
            await db.scalars(
                select(AuditEntry).where(
                    AuditEntry.entity_id == org_id, AuditEntry.action == CASCADE
                )
            )
        ).all()
    )


def _field(entry: AuditEntry, name: str) -> object:
    return next(c["new"] for c in entry.changes if c["field"] == name)


async def _race(org_id: str, change, attempt) -> asyncio.Task:
    """Hold the roster lock in a second session while ``change`` runs, start
    ``attempt`` and check it waits on the lock, then commit the change.

    Returns the attempt task, not yet awaited, so the caller decides what it must do."""
    holder = async_session_factory()
    task: asyncio.Task | None = None
    try:
        await grants.lock_roster(holder, org_id)
        await change(holder)
        await holder.flush()
        task = asyncio.create_task(attempt())
        await asyncio.sleep(0.3)
        assert not task.done(), "the attempt must wait for the roster lock"
        await holder.commit()
    except BaseException:
        if task is not None:
            task.cancel()
        raise
    finally:
        await holder.close()
    return task


async def _three_owners(db: AsyncSession):
    """Three owners, so the last-owner guard never masks the owner rule under test."""
    a, b, c = [await make_user(db) for _ in range(3)]
    org = await make_org(
        db,
        "Roster",
        members=(
            (a, MembershipRole.OWNER),
            (b, MembershipRole.OWNER),
            (c, MembershipRole.OWNER),
        ),
        apps=("events",),
    )
    return a, b, c, org


# ── 1. Acting member re-read after the roster lock ──────────────────────────


async def test_owner_demoted_during_lock_wait_cannot_demote_another_owner(
    db_async: AsyncSession,
):
    a, b, _, org = await _three_owners(db_async)
    stale = await _context(db_async, a, org)  # A is an owner when the request starts
    target = await _membership(db_async, org.id, b.id)

    async def demote_actor(holder: AsyncSession) -> None:
        row = await _membership(holder, org.id, a.id)
        row.role = MembershipRole.ADMIN.value

    async def attempt() -> None:
        await members.change_role(db_async, stale, target.id, MembershipRole.MEMBER)

    task = await _race(org.id, demote_actor, attempt)
    with pytest.raises(OrganisationRoleError):
        await task
    assert (await _membership(db_async, org.id, b.id)).role == MembershipRole.OWNER


async def test_owner_demoted_during_lock_wait_cannot_promote_to_owner(
    db_async: AsyncSession,
):
    a, b, _, org = await _three_owners(db_async)
    member = await make_user(db_async)
    await _add_member(db_async, org.id, member.id)
    stale = await _context(db_async, a, org)
    target = await _membership(db_async, org.id, member.id)

    async def demote_actor(holder: AsyncSession) -> None:
        row = await _membership(holder, org.id, a.id)
        row.role = MembershipRole.ADMIN.value

    async def attempt() -> None:
        await members.change_role(db_async, stale, target.id, MembershipRole.OWNER)

    task = await _race(org.id, demote_actor, attempt)
    with pytest.raises(OrganisationRoleError):
        await task
    assert (await _membership(db_async, org.id, member.id)).role == (
        MembershipRole.MEMBER
    )


async def test_owner_removed_during_lock_wait_cannot_remove_another_owner(
    db_async: AsyncSession,
):
    a, b, _, org = await _three_owners(db_async)
    stale = await _context(db_async, a, org)
    target = await _membership(db_async, org.id, b.id)

    async def remove_actor(holder: AsyncSession) -> None:
        row = await _membership(holder, org.id, a.id)
        row.status = MembershipStatus.REMOVED.value

    async def attempt() -> None:
        await members.remove_member(db_async, stale, target.id)

    task = await _race(org.id, remove_actor, attempt)
    with pytest.raises(OrganisationRoleError):
        await task
    assert await _status(db_async, org.id, b.id) == MembershipStatus.ACTIVE.value


async def test_admin_still_active_after_lock_wait_can_remove_a_member(
    db_async: AsyncSession,
):
    """Positive control: the re-read refuses only a stale actor, not every waiter."""
    a, b, c, org = await _three_owners(db_async)
    admin = await make_user(db_async)
    await _add_member(db_async, org.id, admin.id, role=MembershipRole.ADMIN)
    member = await make_user(db_async)
    await _add_member(db_async, org.id, member.id)
    stale = await _context(db_async, admin, org)
    target = await _membership(db_async, org.id, member.id)

    async def unrelated(holder: AsyncSession) -> None:
        await _membership(holder, org.id, c.id)

    async def attempt() -> None:
        await members.remove_member(db_async, stale, target.id)

    task = await _race(org.id, unrelated, attempt)
    await task
    await db_async.commit()
    assert await _status(db_async, org.id, member.id) == MembershipStatus.REMOVED.value


async def test_actor_must_be_given_or_superuser_flag(db_async: AsyncSession):
    a, b, _, org = await _three_owners(db_async)
    target = await _membership(db_async, org.id, b.id)
    with pytest.raises(ValueError):
        await members.apply_removal(db_async, org.id, target.id, actor_id=a.id)


async def _add_member(
    db: AsyncSession,
    org_id: str,
    user_id,
    *,
    role: MembershipRole = MembershipRole.MEMBER,
) -> None:
    await service.add_member(db, organisation_id=org_id, user_id=user_id, role=role)
    await db.commit()


# ── 2. Grants whose granter was deleted (granted_by NULL) ───────────────────


async def _orphan_world(db: AsyncSession):
    """Owner O; X holds a grant with no granter (its granter's account is gone); Y holds
    a normal grant from O; Z is an ordinary member who can be removed."""
    owner, x_user, y_user, z_user = [await make_user(db) for _ in range(4)]
    org = await make_org(
        db,
        "Orphans",
        members=(
            (owner, MembershipRole.OWNER),
            (x_user, MembershipRole.MEMBER),
            (y_user, MembershipRole.MEMBER),
            (z_user, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    x_row = await _membership(db, org.id, x_user.id)
    y_row = await _membership(db, org.id, y_user.id)
    orphan = await _grant_row(
        db, membership=x_row, role_key="events-door", granted_by=None
    )
    normal = await _grant_row(
        db, membership=y_row, role_key="events-door", granted_by=owner.id
    )
    return owner, x_user, y_user, z_user, org, orphan, normal


async def test_grant_without_granter_carries_no_keys(db_async: AsyncSession):
    _, x_user, y_user, _, org, _, _ = await _orphan_world(db_async)
    x_row = await _membership(db_async, org.id, x_user.id)
    y_row = await _membership(db_async, org.id, y_user.id)
    assert EVENTS_DOOR_KEY not in await grants.effective_keys(
        db_async, membership=x_row
    )
    # Positive control: the same role from a live granter does grant the key.
    assert EVENTS_DOOR_KEY in await grants.effective_keys(db_async, membership=y_row)


async def test_orphan_grant_is_ended_by_a_removal_cascade(db_async: AsyncSession):
    owner, _, _, z_user, org, orphan, normal = await _orphan_world(db_async)
    owner_row = await _membership(db_async, org.id, owner.id)
    z_row = await _membership(db_async, org.id, z_user.id)

    await members.apply_removal(
        db_async,
        org.id,
        z_row.id,
        actor_id=owner.id,
        actor_membership_id=owner_row.id,
    )
    await db_async.commit()

    assert await _is_live(db_async, orphan.id) is False
    assert await _is_live(db_async, normal.id) is True
    entries = await _cascade_entries(db_async, org.id)
    assert [e.record_id for e in entries] == [orphan.id]
    assert _field(entries[0], "trigger") == GRANTOR_GONE


async def test_orphan_grant_is_ended_by_an_explicit_revoke(db_async: AsyncSession):
    owner, _, _, _, org, orphan, normal = await _orphan_world(db_async)
    context = await _context(db_async, owner, org)

    await grants.revoke_grant(db_async, context, grant_id=normal.id)
    await db_async.commit()

    assert await _is_live(db_async, normal.id) is False
    assert await _is_live(db_async, orphan.id) is False
    entries = await _cascade_entries(db_async, org.id)
    assert [e.record_id for e in entries] == [orphan.id]
    assert _field(entries[0], "trigger") == GRANTOR_GONE
    assert _field(entries[0], "root") == normal.id
