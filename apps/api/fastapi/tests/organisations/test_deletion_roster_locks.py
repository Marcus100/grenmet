"""Account deletion takes the roster locks first (issue #1501).

Deleting an account ends its memberships and the grants it issued, in every
organisation it touches. The roster lock of each affected organisation is taken before
any of those rows change, in organisation-id order. A concurrent roster change in one of
those organisations (an admin action holds that lock) then queues the deletion instead
of deadlocking with it.

Deletions also serialise on the active superuser rows (``lock_active_superusers``, #1481),
so two deletions cannot interleave with each other while an active superuser exists.
The order test below is therefore the deterministic check of the lock order; the other
two tests run real sessions side by side, as ``test_membership_reread.py`` does.
"""

import asyncio

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.auth.models import User
from src.database import async_session_factory
from src.exceptions import AppException
from src.organisations import admin_members, grants, members, service
from src.organisations.dependencies import OrgContext
from src.organisations.models import (
    Invitation,
    Membership,
    MembershipGrant,
    MembershipRole,
    MembershipStatus,
)
from tests.factories import make_user
from tests.organisations.support import make_org

DELETE_TIMEOUT_SECONDS = 30


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


async def _grant(db: AsyncSession, grantor, org, target, role_key: str) -> None:
    context = await _context(db, grantor, org)
    target_row = await _membership(db, org.id, target.id)
    await grants.grant_role(db, context, membership_id=target_row.id, role_key=role_key)
    await db.commit()


async def _delete_account(user_id) -> None:
    """Anonymise the account in its own session, as a request would."""
    async with async_session_factory() as session:
        user = await session.get(User, user_id)
        assert user is not None
        await auth_service.delete_user(session=session, user=user)
        await session.commit()


async def _live_grants_issued_by(db: AsyncSession, user_id) -> list[MembershipGrant]:
    return list(
        (
            await db.execute(
                select(MembershipGrant)
                .where(
                    MembershipGrant.granted_by == user_id,
                    MembershipGrant.revoked_at.is_(None),
                )
                .execution_options(populate_existing=True)
            )
        ).scalars()
    )


async def test_roster_locks_of_every_affected_organisation_come_first_in_id_order(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    """Before the account's first membership or grant write, the roster of every
    organisation it is in, or has granted in (here one where its membership is already
    removed but a grant is still live), is locked, in id order."""
    owner = await make_user(db_async)
    leaving = await make_user(db_async)
    member_a = await make_user(db_async)
    member_b = await make_user(db_async)
    member_c = await make_user(db_async)
    org_a = await make_org(
        db_async,
        "Lock order A",
        members=(
            (owner, MembershipRole.OWNER),
            (leaving, MembershipRole.ADMIN),
            (member_a, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    org_b = await make_org(
        db_async,
        "Lock order B",
        members=(
            (owner, MembershipRole.OWNER),
            (leaving, MembershipRole.ADMIN),
            (member_b, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    org_c = await make_org(
        db_async,
        "Lock order C",
        members=(
            (owner, MembershipRole.OWNER),
            (leaving, MembershipRole.ADMIN),
            (member_c, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    await _grant(db_async, leaving, org_a, member_a, "events-door")
    await _grant(db_async, leaving, org_b, member_b, "events-till")
    await _grant(db_async, leaving, org_c, member_c, "events-door")
    stale = await _membership(db_async, org_c.id, leaving.id)
    stale.status = MembershipStatus.REMOVED.value
    await db_async.commit()
    expected = sorted((org_a.id, org_b.id, org_c.id))

    events: list[tuple[str, str]] = []
    real_lock = grants.lock_roster
    real_end_memberships = auth_service._end_organisation_access

    async def spy_lock(session: AsyncSession, organisation_id: str) -> None:
        events.append(("lock", organisation_id))
        await real_lock(session, organisation_id)

    async def spy_end_memberships(session, user_id, now) -> None:
        events.append(("memberships", ""))
        await real_end_memberships(session, user_id, now)

    monkeypatch.setattr(grants, "lock_roster", spy_lock)
    monkeypatch.setattr(auth_service, "_end_organisation_access", spy_end_memberships)

    await auth_service.delete_user(session=db_async, user=leaving)
    await db_async.commit()

    first_write = next(i for i, (kind, _) in enumerate(events) if kind == "memberships")
    locked_before_writes = [org for kind, org in events[:first_write] if kind == "lock"]
    assert locked_before_writes == expected


async def test_two_accounts_deleted_at_once_in_the_same_organisations_both_finish(
    db_async: AsyncSession,
):
    """Two deletions side by side in the same organisations both complete and end what
    each issued. Serialised by the superuser rows here, so this is a guard, not the
    deadlock reproduction."""
    owner = await make_user(db_async)
    first = await make_user(db_async)
    second = await make_user(db_async)
    member_a = await make_user(db_async)
    member_b = await make_user(db_async)
    org_a = await make_org(
        db_async,
        "Two deletions A",
        members=(
            (owner, MembershipRole.OWNER),
            (first, MembershipRole.ADMIN),
            (second, MembershipRole.ADMIN),
            (member_a, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    org_b = await make_org(
        db_async,
        "Two deletions B",
        members=(
            (owner, MembershipRole.OWNER),
            (first, MembershipRole.ADMIN),
            (second, MembershipRole.ADMIN),
            (member_b, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    await _grant(db_async, first, org_a, member_a, "events-door")
    await _grant(db_async, second, org_a, member_a, "events-till")
    await _grant(db_async, first, org_b, member_b, "events-door")
    await _grant(db_async, second, org_b, member_b, "events-till")
    first_id, second_id = first.id, second.id
    org_ids = (org_a.id, org_b.id)

    await asyncio.wait_for(
        asyncio.gather(_delete_account(first_id), _delete_account(second_id)),
        timeout=DELETE_TIMEOUT_SECONDS,
    )

    for org_id in org_ids:
        for gone_id in (first_id, second_id):
            row = await _membership(db_async, org_id, gone_id)
            assert row.status == MembershipStatus.REMOVED.value
    assert await _live_grants_issued_by(db_async, first_id) == []
    assert await _live_grants_issued_by(db_async, second_id) == []


async def test_deletion_waits_for_a_roster_change_in_the_same_organisation(
    db_async: AsyncSession,
):
    """A roster change holds the organisation's roster lock. The deletion waits for it,
    then applies its own changes; the roster change is kept."""
    owner = await make_user(db_async)
    leaving = await make_user(db_async)
    holder_of_grant = await make_user(db_async)
    changed = await make_user(db_async)
    org = await make_org(
        db_async,
        "Roster change during deletion",
        members=(
            (owner, MembershipRole.OWNER),
            (leaving, MembershipRole.ADMIN),
            (holder_of_grant, MembershipRole.MEMBER),
            (changed, MembershipRole.MEMBER),
        ),
        apps=("events",),
    )
    await _grant(db_async, leaving, org, holder_of_grant, "events-door")
    org_id = org.id
    leaving_id = leaving.id
    changed_id = changed.id

    holder = async_session_factory()
    task = None
    try:
        await grants.lock_roster(holder, org_id)
        concurrent = await _membership(holder, org_id, changed_id)
        concurrent.role = MembershipRole.ADMIN.value
        await holder.flush()
        task = asyncio.create_task(_delete_account(leaving_id))
        await asyncio.sleep(0.3)
        assert not task.done(), "the deletion must wait for the roster lock"
        await holder.commit()
    finally:
        await holder.close()
    await asyncio.wait_for(task, timeout=DELETE_TIMEOUT_SECONDS)

    assert (
        await _membership(db_async, org_id, leaving_id)
    ).status == MembershipStatus.REMOVED.value
    assert (await _membership(db_async, org_id, changed_id)).role == (
        MembershipRole.ADMIN.value
    )
    assert await _live_grants_issued_by(db_async, leaving_id) == []


async def test_roster_locks_come_before_access_material_and_role_links(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    """The documented order is roster, then rows (#1564): the person's sessions and role
    links change only after every roster lock is held, so an administrator's access
    change (roster lock, then user row, role link and sessions) cannot deadlock with it."""
    from src.auth import app_service

    owner = await make_user(db_async)
    leaving = await make_user(db_async)
    org = await make_org(
        db_async,
        "Lock order first",
        members=((owner, MembershipRole.OWNER), (leaving, MembershipRole.MEMBER)),
        apps=("events",),
    )
    events: list[str] = []
    real_lock = grants.lock_roster
    real_access = app_service.revoke_access_material
    real_links = auth_service._end_access_links

    async def spy_lock(session: AsyncSession, organisation_id: str) -> None:
        events.append(f"lock:{organisation_id}")
        await real_lock(session, organisation_id)

    async def spy_access(session, user):
        events.append("access_material")
        return await real_access(session, user)

    async def spy_links(session, user_id, now):
        events.append("links")
        await real_links(session, user_id, now)

    monkeypatch.setattr(grants, "lock_roster", spy_lock)
    monkeypatch.setattr(app_service, "revoke_access_material", spy_access)
    monkeypatch.setattr(auth_service, "_end_access_links", spy_links)

    await auth_service.delete_user(session=db_async, user=leaving)
    await db_async.commit()

    assert events.index(f"lock:{org.id}") < events.index("access_material")
    assert events.index(f"lock:{org.id}") < events.index("links")


# Issue #1523: every path that creates or locks a membership row takes the roster
# lock first, and deletion reads its affected set again once the locks are held.


async def _invitation_for(db: AsyncSession, org, email: str, token: str):
    from datetime import timedelta

    from src.organisations.members import hash_token, new_invitation_id
    from src.utils.datetime import utc_now

    db.add(
        Invitation(
            id=new_invitation_id(),
            organisation_id=org.id,
            email=email,
            role=MembershipRole.MEMBER.value,
            token_hash=hash_token(token),
            expires_at=utc_now() + timedelta(days=1),
        )
    )
    await db.commit()


async def test_accepting_an_invitation_waits_for_the_roster_lock(
    db_async: AsyncSession,
):
    owner = await make_user(db_async)
    joiner = await make_user(db_async)
    org = await make_org(
        db_async,
        "Accept lock order",
        members=((owner, MembershipRole.OWNER),),
        apps=("events",),
    )
    await _invitation_for(db_async, org, joiner.email.lower(), "token-1523-accept")
    org_id, joiner_id = org.id, joiner.id

    async def accept() -> None:
        async with async_session_factory() as session:
            user = await session.get(User, joiner_id)
            assert user is not None
            await members.accept_invitation(session, user, "token-1523-accept")
            await session.commit()

    holder = async_session_factory()
    task = None
    try:
        await grants.lock_roster(holder, org_id)
        task = asyncio.create_task(accept())
        await asyncio.sleep(0.3)
        assert not task.done(), "accepting must wait for the roster lock"
        await holder.commit()
    finally:
        await holder.close()
    await asyncio.wait_for(task, timeout=DELETE_TIMEOUT_SECONDS)

    row = await _membership(db_async, org_id, joiner_id)
    assert row.status == MembershipStatus.ACTIVE.value


async def test_admin_add_waits_for_the_roster_lock(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
):
    monkeypatch.setattr(
        admin_members.superuser_mfa, "require_superuser_mfa", lambda _u: None
    )
    owner = await make_user(db_async)
    admin = await make_user(db_async, superuser=True)
    added = await make_user(db_async)
    org = await make_org(
        db_async,
        "Admin add lock order",
        members=((owner, MembershipRole.OWNER),),
        apps=("events",),
    )
    org_id, admin_id, added_id = org.id, admin.id, added.id

    async def add() -> None:
        async with async_session_factory() as session:
            actor = await session.get(User, admin_id)
            assert actor is not None
            await admin_members.add(
                session,
                actor,
                org_id,
                user_id=added_id,
                email=None,
                role=MembershipRole.MEMBER,
                reason="lock order",
            )
            await session.commit()

    holder = async_session_factory()
    task = None
    try:
        await grants.lock_roster(holder, org_id)
        task = asyncio.create_task(add())
        await asyncio.sleep(0.3)
        assert not task.done(), "the add must wait for the roster lock"
        await holder.commit()
    finally:
        await holder.close()
    await asyncio.wait_for(task, timeout=DELETE_TIMEOUT_SECONDS)

    row = await _membership(db_async, org_id, added_id)
    assert row.status == MembershipStatus.ACTIVE.value


async def _wait_blocked(task: asyncio.Task) -> None:
    await asyncio.sleep(0.4)
    assert not task.done(), "must wait for the account lock"


@pytest.mark.parametrize("reactivation", [False, True])
async def test_deletion_sees_an_in_flight_uncommitted_accept(
    db_async: AsyncSession, reactivation: bool
):
    """An accept has inserted (or reactivated) a membership in an organisation the
    account was not active in, uncommitted. The deletion starts meanwhile: the account
    lock makes it wait, then its read sees the committed membership and ends it. Row
    locks alone would not: a lock cannot stop an INSERT the deletion cannot see."""
    owner = await make_user(db_async)
    leaving = await make_user(db_async)
    org_a = await make_org(
        db_async,
        "In flight A",
        members=((owner, MembershipRole.OWNER), (leaving, MembershipRole.MEMBER)),
        apps=("events",),
    )
    org_b = await make_org(
        db_async,
        "In flight B",
        members=((owner, MembershipRole.OWNER),),
        apps=("events",),
    )
    if reactivation:
        await service.add_member(
            db_async,
            organisation_id=org_b.id,
            user_id=leaving.id,
            role=MembershipRole.MEMBER,
            status=MembershipStatus.REMOVED,
        )
    await _invitation_for(db_async, org_b, leaving.email.lower(), "token-1523-flight")
    leaving_id, org_a_id, org_b_id = leaving.id, org_a.id, org_b.id

    accepting = async_session_factory()
    task = None
    try:
        user = await accepting.get(User, leaving_id)
        assert user is not None
        await members.accept_invitation(accepting, user, "token-1523-flight")
        task = asyncio.create_task(_delete_account(leaving_id))
        await _wait_blocked(task)
        await accepting.commit()
    finally:
        await accepting.close()
    await asyncio.wait_for(task, timeout=DELETE_TIMEOUT_SECONDS)

    for org_id in (org_a_id, org_b_id):
        row = await _membership(db_async, org_id, leaving_id)
        assert row.status == MembershipStatus.REMOVED.value


@pytest.mark.parametrize("reactivation", [False, True])
async def test_an_accept_queued_behind_a_deletion_is_refused(
    db_async: AsyncSession, reactivation: bool
):
    """The deletion holds the account lock; an accept queued behind it continues with a
    refreshed account, sees it anonymised and fails: no membership is created or
    reactivated on the deleted account."""
    owner = await make_user(db_async)
    leaving = await make_user(db_async)
    org = await make_org(
        db_async,
        "Queued accept",
        members=((owner, MembershipRole.OWNER),),
        apps=("events",),
    )
    if reactivation:
        await service.add_member(
            db_async,
            organisation_id=org.id,
            user_id=leaving.id,
            role=MembershipRole.MEMBER,
            status=MembershipStatus.REMOVED,
        )
    email = leaving.email.lower()
    await _invitation_for(db_async, org, email, "token-1523-queued")
    leaving_id, org_id = leaving.id, org.id

    async def accept() -> None:
        async with async_session_factory() as session:
            user = await session.get(
                User, leaving_id
            )  # loaded before the deletion ends
            assert user is not None
            await asyncio.sleep(0.4)
            await members.accept_invitation(session, user, "token-1523-queued")
            await session.commit()

    deleting = async_session_factory()
    task = None
    try:
        user = await deleting.get(User, leaving_id)
        assert user is not None
        task = asyncio.create_task(accept())
        await auth_service.delete_user(session=deleting, user=user)
        await asyncio.sleep(0.8)  # the accept is now waiting on the account lock
        await deleting.commit()
    finally:
        await deleting.close()
    with pytest.raises(AppException):
        await asyncio.wait_for(task, timeout=DELETE_TIMEOUT_SECONDS)

    rows = (
        (
            await db_async.execute(
                select(Membership)
                .where(
                    Membership.organisation_id == org_id,
                    Membership.user_id == leaving_id,
                )
                .execution_options(populate_existing=True)
            )
        )
        .scalars()
        .all()
    )
    assert all(row.status != MembershipStatus.ACTIVE.value for row in rows)


async def test_create_organiser_takes_the_account_lock_and_is_refused_after_deletion(
    db_async: AsyncSession,
):
    """``create_organiser`` inserts an owner membership through ``add_member``, which
    takes the account lock: it waits for a transaction holding it, and once the account
    is deleted it is refused instead of leaving an active owner on an anonymised
    account."""
    from src.events.service.organiser_admin import create_organiser

    creator = await make_user(db_async)
    doomed = await make_user(db_async)
    creator_id, doomed_id = creator.id, doomed.id

    async def create(user_id, name: str) -> None:
        async with async_session_factory() as session:
            user = await session.get(User, user_id)
            assert user is not None
            await create_organiser(session, user, name=name)
            await session.commit()

    holder = async_session_factory()
    task = None
    try:
        await grants.lock_user(holder, creator_id)
        task = asyncio.create_task(create(creator_id, "Race Crew 1523 a"))
        await _wait_blocked(task)
        await holder.commit()
    finally:
        await holder.close()
    await asyncio.wait_for(task, timeout=DELETE_TIMEOUT_SECONDS)

    await _delete_account(doomed_id)
    with pytest.raises(AppException):
        await create(doomed_id, "Race Crew 1523 b")
    active = (
        (
            await db_async.execute(
                select(Membership).where(
                    Membership.user_id == doomed_id,
                    Membership.status == MembershipStatus.ACTIVE.value,
                )
            )
        )
        .scalars()
        .all()
    )
    assert active == []


async def test_two_deletions_sharing_organisations_do_not_deadlock_with_late_members(
    db_async: AsyncSession,
):
    """Both accounts are in the same organisations; each deletion takes its own account
    lock, then the rosters in id order, one pass: they finish."""
    first = await make_user(db_async)
    second = await make_user(db_async)
    owner = await make_user(db_async)
    orgs = [
        await make_org(
            db_async,
            f"Shared {n}",
            members=(
                (owner, MembershipRole.OWNER),
                (first, MembershipRole.MEMBER),
                (second, MembershipRole.MEMBER),
            ),
            apps=("events",),
        )
        for n in range(3)
    ]
    ids = (first.id, second.id)
    await asyncio.wait_for(
        asyncio.gather(*(_delete_account(i) for i in ids)),
        timeout=DELETE_TIMEOUT_SECONDS,
    )
    for org in orgs:
        for uid in ids:
            row = await _membership(db_async, org.id, uid)
            assert row.status == MembershipStatus.REMOVED.value
