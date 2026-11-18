"""The ``printix-member`` sign-in role goes when a person's last Printix access ends,
by whichever route ends it (#1564), and the batch sign-in check agrees with the
one-account check."""

import uuid
from collections.abc import Awaitable, Callable

import pytest
from sqlalchemy import event, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import eligibility
from src.auth import service as auth_service
from src.auth.models import (
    Permission,
    Role,
    RolePermissionLink,
    User,
    UserRoleLink,
)
from src.auth.models import Session as LoginSession
from src.auth.permissions import seed_permissions_and_roles_async
from src.hr.models import EmploymentStatus
from src.organisations import admin_members, grants, members, service
from src.organisations.dependencies import OrgContext
from src.organisations.models import (
    Membership,
    MembershipGrant,
    MembershipRole,
    PlatformOrganisation,
)
from src.printix import app_role, onboarding
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_user,
)
from tests.organisations.support import make_org

from .org_support import _app_user, _grant, _sign_in, make_org_member

pytestmark = pytest.mark.usefixtures("db_async")

MakeAdmin = Callable[[], Awaitable[tuple[User, dict[str, str]]]]


@pytest.fixture(autouse=True)
async def _roles(db_async: AsyncSession) -> None:
    await seed_permissions_and_roles_async(db_async)


async def _has_role(db: AsyncSession, user: User) -> bool:
    return (
        await db.scalar(
            select(UserRoleLink.user_id)
            .join(Role, Role.id == UserRoleLink.role_id)
            .where(UserRoleLink.user_id == user.id, Role.name == "printix-member")
        )
        is not None
    )


async def _printix_sessions(db: AsyncSession, user: User) -> list[LoginSession]:
    rows = await db.scalars(
        select(LoginSession)
        .where(
            LoginSession.user_id == user.id,
            LoginSession.app_name == "printix",
            LoginSession.revoked_at.is_(None),
        )
        .execution_options(populate_existing=True)
    )
    return list(rows.all())


async def _org(db: AsyncSession, *owners: User) -> PlatformOrganisation:
    return await make_org(
        db,
        f"Org {uuid.uuid4().hex[:6]}",
        members=tuple((u, MembershipRole.OWNER) for u in owners),
        apps=("printix",),
    )


async def _holder(
    db: AsyncSession, org: PlatformOrganisation, role_key: str = "printix-gate-lead"
) -> tuple[User, Membership]:
    """A member with a live bundle, the sign-in role and a live Printix session."""
    user = await _app_user(db)
    membership = await make_org_member(db, org, user)
    await _grant(db, org, user, role_key)
    await _sign_in(db, user)
    assert len(await _printix_sessions(db, user)) == 1
    return user, membership


async def _context(
    db: AsyncSession, user: User, org: PlatformOrganisation
) -> OrgContext:
    resolved = await service.resolve_membership(
        db, user_id=user.id, organisation_id=org.id
    )
    return OrgContext(
        organisation=resolved.organisation, membership=resolved.membership, user=user
    )


async def _released(db: AsyncSession, user: User) -> bool:
    await db.commit()
    return not await _has_role(db, user) and not await _printix_sessions(db, user)


# --- Members: removal -------------------------------------------------------------


async def test_removing_a_member_takes_the_role_and_ends_sessions(
    db_async: AsyncSession,
) -> None:
    owner = await make_user(db_async)
    org = await _org(db_async, owner)
    user, membership = await _holder(db_async, org)

    await members.apply_removal(
        db_async,
        org.id,
        membership.id,
        actor_id=owner.id,
        actor_may_grant_owner=True,
    )

    assert await _released(db_async, user)


async def test_the_barrels_admin_removal_takes_the_role(
    db_async: AsyncSession, mfa_admin: MakeAdmin
) -> None:
    admin, _ = await mfa_admin()
    org = await _org(db_async)
    user, membership = await _holder(db_async, org)

    await admin_members.remove(
        db_async, admin, org.id, membership.id, reason="Left the company"
    )

    assert await _released(db_async, user)


async def test_removal_keeps_the_role_while_another_organisation_gives_access(
    db_async: AsyncSession,
) -> None:
    owner = await make_user(db_async)
    org_a = await _org(db_async, owner)
    org_b = await _org(db_async)
    user, member_a = await _holder(db_async, org_a)
    await make_org_member(db_async, org_b, user)
    await _grant(db_async, org_b, user, "printix-organiser")

    await members.apply_removal(
        db_async, org_a.id, member_a.id, actor_id=owner.id, actor_may_grant_owner=True
    )

    assert await _has_role(db_async, user)


async def test_removal_leaves_a_role_given_by_hand_alone(
    db_async: AsyncSession,
) -> None:
    owner = await make_user(db_async)
    org = await _org(db_async, owner)
    user = await _app_user(db_async)  # role, but never any Printix access here
    membership = await make_org_member(db_async, org, user)

    await members.apply_removal(
        db_async, org.id, membership.id, actor_id=owner.id, actor_may_grant_owner=True
    )

    assert await _has_role(db_async, user)


async def test_removing_a_grantor_takes_the_role_of_whoever_their_grant_supported(
    db_async: AsyncSession,
) -> None:
    """A manager's removal ends the grants they issued; the recipient's last access
    ends with it, so the recipient's role goes too."""
    owner = await make_user(db_async)
    org = await _org(db_async, owner)
    manager = await make_user(db_async)
    manager_membership = await make_org_member(db_async, org, manager)
    manager_membership.role = MembershipRole.ADMIN.value
    await db_async.commit()
    recipient = await _app_user(db_async)
    await make_org_member(db_async, org, recipient)
    await grants.grant_role(
        db_async,
        await _context(db_async, manager, org),
        membership_id=(
            await db_async.scalar(
                select(Membership.id).where(
                    Membership.organisation_id == org.id,
                    Membership.user_id == recipient.id,
                )
            )
        )
        or "",
        role_key="printix-gate-lead",
    )
    await db_async.commit()
    await _sign_in(db_async, recipient)

    await members.apply_removal(
        db_async,
        org.id,
        manager_membership.id,
        actor_id=owner.id,
        actor_may_grant_owner=True,
    )

    assert await _released(db_async, recipient)


async def test_only_people_who_lost_access_are_touched(
    db_async: AsyncSession, monkeypatch: pytest.MonkeyPatch
) -> None:
    owner = await make_user(db_async)
    org = await _org(db_async, owner)
    leaving, leaving_membership = await _holder(db_async, org)
    bystanders = [(await _holder(db_async, org))[0] for _ in range(3)]
    touched: list[uuid.UUID] = []
    real = app_role.drop_role_if_unneeded

    async def spy(
        session: AsyncSession, user_id: uuid.UUID, *, role_id: uuid.UUID | None = None
    ) -> bool:
        touched.append(user_id)
        return await real(session, user_id, role_id=role_id)

    monkeypatch.setattr(app_role, "drop_role_if_unneeded", spy)
    leaving_id = leaving.id
    bystander_ids = [b.id for b in bystanders]

    await members.apply_removal(
        db_async,
        org.id,
        leaving_membership.id,
        actor_id=owner.id,
        actor_may_grant_owner=True,
    )

    assert touched == [leaving_id]
    for bystander_id in bystander_ids:
        assert bystander_id not in touched


async def test_a_superuser_keeps_their_printix_sessions_when_the_role_goes(
    db_async: AsyncSession,
) -> None:
    owner = await make_user(db_async)
    org = await _org(db_async, owner)
    user, membership = await _holder(db_async, org)
    user.is_superuser = True
    await db_async.commit()

    await members.apply_removal(
        db_async,
        org.id,
        membership.id,
        actor_id=owner.id,
        actor_may_grant_owner=True,
    )
    await db_async.commit()

    assert not await _has_role(db_async, user)
    assert len(await _printix_sessions(db_async, user)) == 1


async def _recipient_of_a_managers_grant(
    db: AsyncSession, org: PlatformOrganisation, manager: User
) -> User:
    recipient = await _app_user(db)
    await make_org_member(db, org, recipient)
    recipient_membership = await db.scalar(
        select(Membership).where(
            Membership.organisation_id == org.id, Membership.user_id == recipient.id
        )
    )
    assert recipient_membership is not None
    await grants.grant_role(
        db,
        await _context(db, manager, org),
        membership_id=recipient_membership.id,
        role_key="printix-gate-lead",
    )
    await db.commit()
    await _sign_in(db, recipient)
    return recipient


async def test_deleting_a_grantors_account_takes_their_recipients_role(
    db_async: AsyncSession,
) -> None:
    owner = await make_user(db_async)
    org = await _org(db_async, owner)
    manager = await make_user(db_async)
    manager_membership = await make_org_member(db_async, org, manager)
    manager_membership.role = MembershipRole.ADMIN.value
    await db_async.commit()
    recipient = await _recipient_of_a_managers_grant(db_async, org, manager)
    other_org = await _org(db_async)
    keeper = await _recipient_of_a_managers_grant(db_async, org, manager)
    await make_org_member(db_async, other_org, keeper)
    await _grant(db_async, other_org, keeper, "printix-organiser")

    await auth_service.delete_user(session=db_async, user=manager)
    await db_async.commit()

    assert await _released(db_async, recipient)
    assert await _has_role(db_async, keeper)
    assert len(await _printix_sessions(db_async, keeper)) == 1


# --- Org zone: grant revoke -------------------------------------------------------


async def test_revoking_the_last_bundle_through_the_org_route_takes_the_role(
    db_async: AsyncSession,
) -> None:
    owner = await make_user(db_async)
    org = await _org(db_async, owner)
    user, membership = await _holder(db_async, org)
    grant_id = await db_async.scalar(
        select(MembershipGrant.id).where(MembershipGrant.membership_id == membership.id)
    )
    assert grant_id is not None

    await grants.revoke_grant_detailed(
        db_async, await _context(db_async, owner, org), grant_id=grant_id
    )

    assert await _released(db_async, user)


async def test_revoking_one_bundle_keeps_the_role_when_another_remains(
    db_async: AsyncSession,
) -> None:
    owner = await make_user(db_async)
    org_a = await _org(db_async, owner)
    org_b = await _org(db_async)
    user, membership = await _holder(db_async, org_a)
    await make_org_member(db_async, org_b, user)
    await _grant(db_async, org_b, user, "printix-gate-lead")
    grant_id = await db_async.scalar(
        select(MembershipGrant.id).where(MembershipGrant.membership_id == membership.id)
    )
    assert grant_id is not None

    await grants.revoke_grant_detailed(
        db_async, await _context(db_async, owner, org_a), grant_id=grant_id
    )

    assert await _has_role(db_async, user)


# --- Demotion ---------------------------------------------------------------------


async def test_demoting_an_admin_takes_the_role(db_async: AsyncSession) -> None:
    owner = await make_user(db_async)
    org = await _org(db_async, owner)
    user = await _app_user(db_async)
    membership = await make_org_member(db_async, org, user)
    membership.role = MembershipRole.ADMIN.value  # holds every key by role
    await db_async.commit()
    await _sign_in(db_async, user)

    await members.apply_role_change(
        db_async,
        org.id,
        membership.id,
        MembershipRole.MEMBER,
        actor_id=owner.id,
        actor_may_grant_owner=True,
    )

    assert await _released(db_async, user)


async def test_demoting_an_admin_who_keeps_a_bundle_keeps_the_role(
    db_async: AsyncSession,
) -> None:
    owner = await make_user(db_async)
    org = await _org(db_async, owner)
    user, membership = await _holder(db_async, org)
    membership.role = MembershipRole.ADMIN.value
    await db_async.commit()

    await members.apply_role_change(
        db_async,
        org.id,
        membership.id,
        MembershipRole.MEMBER,
        actor_id=owner.id,
        actor_may_grant_owner=True,
    )

    assert await _has_role(db_async, user)


# --- Entitlement ------------------------------------------------------------------


async def test_switching_printix_off_takes_the_role_of_its_holders(
    db_async: AsyncSession,
) -> None:
    org = await _org(db_async)
    user, _ = await _holder(db_async, org)
    owner = await _app_user(db_async)
    owner_membership = await make_org_member(db_async, org, owner)
    owner_membership.role = MembershipRole.OWNER.value
    await db_async.commit()

    await service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="printix", enabled=False
    )

    assert await _released(db_async, user)
    assert await _released(db_async, owner)


async def test_switching_another_app_off_leaves_the_role(
    db_async: AsyncSession,
) -> None:
    org = await make_org(
        db_async, f"Org {uuid.uuid4().hex[:6]}", apps=("printix", "bookings")
    )
    user, _ = await _holder(db_async, org)

    await service.set_app_enabled(
        db_async, organisation_id=org.id, app_key="bookings", enabled=False
    )

    assert await _has_role(db_async, user)


# --- Onboarding hardening ---------------------------------------------------------


async def test_add_member_checks_the_authenticator_before_anything_else(
    db_async: AsyncSession,
) -> None:
    """A superuser with no authenticator gets the authenticator refusal even when the
    organisation is not entitled (it must not learn the entitlement first)."""
    from src.auth.superuser_mfa import SuperuserMfaRequiredError

    admin = await make_user(db_async, superuser=True)
    org = await make_org(db_async, f"Org {uuid.uuid4().hex[:6]}", apps=())

    with pytest.raises(SuperuserMfaRequiredError):
        await onboarding.add_member(
            db_async,
            admin,
            org.id,
            user_id=None,
            email="nobody@example.com",
            access=onboarding.PrintixAccess.ORGANISER,
            reason="Rehearsal",
        )


# --- Batch sign-in check ----------------------------------------------------------


async def test_the_batch_sign_in_check_matches_the_one_account_check(
    db_async: AsyncSession,
) -> None:
    with_role = await _app_user(db_async)
    without = await make_user(db_async)
    inactive = await _app_user(db_async)
    inactive.is_active = False
    superuser = await make_user(db_async, superuser=True)
    pending = await _app_user(db_async)
    pending.password_setup_pending = True
    pending.email_verified_at = None
    # Ended employment: the plain role link no longer counts.
    ended = await _app_user(db_async)
    department = await make_department(db_async)
    record = await make_employee(db_async, user=ended, department_id=department.id)
    record.status = EmploymentStatus.TERMINATED
    # A department-authority role is not a plain link.
    authority_role = await db_async.scalar(
        select(Role).where(Role.name == "department-manager")
    )
    printix_permission = await db_async.scalar(
        select(Permission).where(Permission.key == "app.printix.access")
    )
    assert authority_role is not None
    assert printix_permission is not None
    db_async.add(
        RolePermissionLink(
            role_id=authority_role.id, permission_id=printix_permission.id
        )
    )
    authority = await make_user(db_async)
    db_async.add(UserRoleLink(user_id=authority.id, role_id=authority_role.id))
    # A grant through a role assignment, with no plain link.
    assigned = await make_user(db_async)
    printix_role = await db_async.scalar(
        select(Role).where(Role.name == "printix-member")
    )
    assert printix_role is not None
    await assign_role(db_async, user=assigned, role=printix_role)
    await db_async.commit()
    users = [
        with_role,
        without,
        inactive,
        superuser,
        pending,
        ended,
        authority,
        assigned,
    ]

    ready = await onboarding.sign_in_ready_ids(db_async, users)

    for user in users:
        assert (user.id in ready) == await auth_service.is_eligible_for_app(
            session=db_async, user=user, app_key="printix"
        )
    assert {with_role.id, superuser.id, assigned.id} <= ready
    assert not ready & {
        without.id,
        inactive.id,
        pending.id,
        ended.id,
        authority.id,
    }


async def test_the_batch_sign_in_check_uses_a_fixed_number_of_queries(
    db_async: AsyncSession,
) -> None:
    statements: list[str] = []

    def count(_conn: object, _cursor: object, statement: str, *_: object) -> None:
        statements.append(statement)

    async def run(n: int) -> int:
        users = [await _app_user(db_async) for _ in range(n)]
        statements.clear()
        await eligibility.eligible_user_ids_for_app(
            session=db_async, users=users, app_key="printix"
        )
        return len(statements)

    engine = db_async.bind.sync_engine
    event.listen(engine, "before_cursor_execute", count)
    try:
        few = await run(1)
        many = await run(6)
    finally:
        event.remove(engine, "before_cursor_execute", count)
    assert few == many
