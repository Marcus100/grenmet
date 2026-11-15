"""Acting member re-read after the roster lock (issue #1477).

Member removal and role change take ``lock_roster`` first. The actor's membership was
read before that lock, so a concurrent demotion or removal of the actor is only visible
after it. The change is refused then. The race tests hold the lock in a second session,
demote or remove the actor there, and only commit after the attempt is waiting on the
lock.
"""

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.database import async_session_factory
from src.organisations import grants, members, service
from src.organisations.dependencies import OrgContext
from src.organisations.exceptions import OrganisationRoleError
from src.organisations.models import Membership, MembershipRole, MembershipStatus
from tests.factories import make_user
from tests.organisations.support import make_org


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


async def _status(db: AsyncSession, org_id: str, user_id) -> str:
    return (await _membership(db, org_id, user_id)).status


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
