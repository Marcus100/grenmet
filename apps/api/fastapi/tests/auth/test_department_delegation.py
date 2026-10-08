"""Department authority cannot escape placement or outlive its source."""

from datetime import timedelta

import pytest
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import set_committed_value

from src.audit.models import AuditEntry
from src.auth import service
from src.auth.access import effective_roles
from src.auth.models import Role, RoleAssignmentScope, UserRoleAssignment, UserRoleLink
from src.auth.permissions import DEFAULT_ROLES
from src.auth.policy import approval_role_ids, can_act_on_user_for_role
from src.auth.routers import users
from src.auth.schemas import (
    UserRoleAssignmentCreate,
    UserRoleAssignmentUpdate,
    UserUpdate,
)
from src.exceptions import AppException
from src.hr.models import Organisation
from src.pagination import PaginationParams
from src.utils.datetime import utc_now
from tests.factories import assign_role, make_department, make_employee, make_user


async def setup(session: AsyncSession, name: str = "department-manager"):
    from src.auth.permissions import seed_permissions_and_roles_async

    await seed_permissions_and_roles_async(session)
    department = await make_department(session, "delegated-met")
    other_department = await make_department(session, "delegated-other")
    session.add(
        Organisation(id="delegated_org", code="DELEGATED", name="Other employer")
    )
    await session.commit()
    foreign_department = await make_department(
        session, "delegated-foreign", organisation_id="delegated_org"
    )
    actor, target, outsider, foreign = [await make_user(session) for _ in range(4)]
    for user, dep in [
        (actor, department),
        (target, department),
        (outsider, other_department),
        (foreign, foreign_department),
    ]:
        await make_employee(session, user=user, department_id=dep.id)
    role = await session.scalar(
        select(Role).where(Role.name == name).options(selectinload(Role.permissions))
    )
    staff = await session.scalar(
        select(Role).where(Role.name == "staff").options(selectinload(Role.permissions))
    )
    authority = await assign_role(
        session,
        user=actor,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=department.id,
    )
    set_committed_value(actor, "roles", await effective_roles(session, actor))
    return actor, target, outsider, foreign, authority, staff, role


def test_authority_templates_are_equal_and_exclude_sensitive_duties():
    keys = DEFAULT_ROLES["department-manager"][1]
    assert keys == DEFAULT_ROLES["department-assistant-manager"][1]
    assert "user.manage" in keys
    assert "audit.view_sensitive" not in keys
    assert "hr.document.read.restricted" not in keys
    assert "workflow.template.manage" not in keys


@pytest.mark.parametrize("name", ["department-manager", "department-assistant-manager"])
async def test_equal_department_approval_roles_keep_live_scope(
    db_async: AsyncSession, name: str
):
    from src.hr.models import EmploymentRecord, EmploymentStatus

    actor, target, outsider, foreign, authority, _, own_role = await setup(
        db_async, name
    )
    other_role = await db_async.scalar(
        select(Role).where(
            Role.name.in_({"department-manager", "department-assistant-manager"}),
            Role.name != name,
        )
    )
    special_role = await db_async.scalar(
        select(Role).where(Role.name == "hr-supervisor")
    )
    assert await approval_role_ids(db_async, {own_role.id}) == {
        own_role.id,
        other_role.id,
    }
    assert await approval_role_ids(db_async, {special_role.id}) == {special_role.id}

    async def allowed(subject=target, required=other_role):
        return await can_act_on_user_for_role(
            session=db_async,
            current_user=actor,
            target_user_id=subject.id,
            required_role_id=required.id,
        )

    assert await allowed()
    assert not await allowed(outsider)
    assert not await allowed(foreign)
    assert not await allowed(required=special_role)
    authority.effective_to = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    assert not await allowed()
    authority.effective_to = None
    issuer = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == actor.id)
    )
    issuer.status = EmploymentStatus.TERMINATED
    await db_async.commit()
    assert not await allowed()
    issuer.status = EmploymentStatus.ACTIVE
    destination = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == outsider.id)
    )
    issuer.department_id = destination.department_id
    await db_async.commit()
    assert not await allowed()


async def test_explicit_staff_approval_replaces_expired_delegation(
    db_async: AsyncSession,
):
    from src.baseline import service as baseline_service
    from tests.factories import make_ready_staff

    actor, target, _, _, authority, staff, _ = await setup(db_async)
    grant = await service.create_user_role_assignment(
        session=db_async,
        current_user=actor,
        assignment_in=UserRoleAssignmentCreate(user_id=target.id, role_id=staff.id),
    )
    grant.effective_to = utc_now() - timedelta(seconds=1)
    target.registration_pending = True
    target.email_verified_at = utc_now()
    await db_async.commit()
    await make_ready_staff(db_async, target, authority.department_id)
    administrator = await make_user(db_async, superuser=True)
    await baseline_service.approve_registration(db_async, administrator, target.id)
    await db_async.refresh(grant)
    assert grant.authority_assignment_id is None
    assert grant.effective_to is None
    await service.delete_user_role_assignment(session=db_async, db_assignment=authority)
    assert [r.name for r in await effective_roles(db_async, target)] == ["staff"]


async def test_manager_authority_requires_explicit_valid_department_appointment(
    db_async: AsyncSession,
):
    actor, target, _, _, authority, staff, manager_role = await setup(db_async)
    db_async.add(UserRoleLink(user_id=target.id, role_id=manager_role.id))
    await db_async.commit()
    assert await effective_roles(db_async, target) == []
    await service.create_user_role_assignment(
        session=db_async,
        current_user=actor,
        assignment_in=UserRoleAssignmentCreate(user_id=target.id, role_id=staff.id),
    )
    authority.scope = RoleAssignmentScope.ALL
    authority.department_id = None
    await db_async.commit()
    assert await effective_roles(db_async, actor) == []
    assert await effective_roles(db_async, target) == []


@pytest.mark.parametrize("name", ["department-manager", "department-assistant-manager"])
async def test_users_counts_and_id_mutations_are_scoped(
    db_async: AsyncSession, name: str
):
    actor, target, outsider, foreign, *_ = await setup(db_async, name)
    page = await users.read_users(
        session=db_async,
        current_user=actor,
        pagination=PaginationParams(page=1, size=1),
    )
    assert page.count == 2
    assert len(page.data) == 1
    assert (await users.read_user_by_id(target.id, db_async, actor)).id == target.id
    updated = await users.update_user(
        session=db_async,
        user_id=target.id,
        user_in=UserUpdate(first_name="Corrected"),
        current_user=actor,
    )
    assert updated.first_name == "Corrected"
    for subject, changes in (
        (target, {"is_active": False}),
        (target, {"is_superuser": True}),
        (actor, {"first_name": "Self"}),
    ):
        with pytest.raises(HTTPException):
            await users.update_user(
                session=db_async,
                user_id=subject.id,
                user_in=UserUpdate(**changes),
                current_user=actor,
            )
    for other in (outsider, foreign):
        with pytest.raises(AppException):
            await users.read_user_by_id(other.id, db_async, actor)
        with pytest.raises(AppException):
            await users.update_user(
                session=db_async,
                user_id=other.id,
                user_in=UserUpdate(first_name="Changed"),
                current_user=actor,
            )
        with pytest.raises(AppException):
            await users.delete_user(db_async, actor, other.id)


async def test_delegated_grant_is_bounded_audited_and_loses_revoked_authority(
    db_async: AsyncSession,
):
    actor, target, outsider, foreign, authority, staff, privileged = await setup(
        db_async
    )
    authority.effective_to = utc_now() + timedelta(days=1)
    await db_async.commit()
    grant = await service.create_user_role_assignment(
        session=db_async,
        current_user=actor,
        assignment_in=UserRoleAssignmentCreate(user_id=target.id, role_id=staff.id),
    )
    assert grant.authority_assignment_id == authority.id
    assert grant.effective_to == authority.effective_to
    assert [r.name for r in await effective_roles(db_async, target)] == ["staff"]
    assert await db_async.scalar(
        select(AuditEntry.id).where(
            AuditEntry.record_type == "role_assignment",
            AuditEntry.action == "CREATE",
            AuditEntry.actor_user_id == actor.id,
        )
    )
    for subject, role, scope in [
        (actor, staff, RoleAssignmentScope.SELF),
        (outsider, staff, RoleAssignmentScope.SELF),
        (foreign, staff, RoleAssignmentScope.SELF),
        (target, privileged, RoleAssignmentScope.DEPARTMENT),
        (target, staff, RoleAssignmentScope.ALL),
    ]:
        with pytest.raises(AppException):
            await service.create_user_role_assignment(
                session=db_async,
                current_user=actor,
                assignment_in=UserRoleAssignmentCreate(
                    user_id=subject.id,
                    role_id=role.id,
                    scope=scope,
                    department_id=authority.department_id
                    if scope == RoleAssignmentScope.DEPARTMENT
                    else None,
                ),
            )
    db_async.add(UserRoleLink(user_id=target.id, role_id=staff.id))
    await db_async.commit()
    await service.delete_user_role_assignment(session=db_async, db_assignment=authority)
    assert await db_async.get(UserRoleAssignment, grant.id) is not None
    assert await effective_roles(db_async, target) == []


async def test_expiry_scope_change_and_permission_changes_disable_grants(
    db_async: AsyncSession,
):
    actor, target, outsider, _, authority, staff, _ = await setup(db_async)
    grant = await service.create_user_role_assignment(
        session=db_async,
        current_user=actor,
        assignment_in=UserRoleAssignmentCreate(user_id=target.id, role_id=staff.id),
    )
    with pytest.raises(AppException):
        await service.update_user_role_assignment(
            session=db_async,
            current_user=actor,
            db_assignment=grant,
            assignment_in=UserRoleAssignmentUpdate(scope=RoleAssignmentScope.ALL),
        )
    original_department = authority.department_id
    from src.hr.models import EmploymentRecord

    employment = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == outsider.id)
    )
    authority.department_id = employment.department_id
    await db_async.commit()
    assert await effective_roles(db_async, target) == []
    authority.department_id = original_department
    authority.effective_to = utc_now() - timedelta(seconds=1)
    await db_async.commit()
    assert await effective_roles(db_async, target) == []
    authority.effective_to = None
    await db_async.commit()
    assert await effective_roles(db_async, target)
    from src.auth.models import Permission

    privileged = await db_async.scalar(
        select(Permission).where(Permission.key == "user.manage")
    )
    staff.permissions.append(privileged)
    await db_async.commit()
    assert await effective_roles(db_async, target) == []


@pytest.mark.parametrize("change", ["terminate", "transfer"])
async def test_departed_manager_loses_authority_and_delegated_grants(
    db_async: AsyncSession, change: str
):
    from src.hr.models import EmploymentRecord, EmploymentStatus

    actor, target, outsider, _, _, staff, _ = await setup(db_async)
    await service.create_user_role_assignment(
        session=db_async,
        current_user=actor,
        assignment_in=UserRoleAssignmentCreate(user_id=target.id, role_id=staff.id),
    )
    issuer = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == actor.id)
    )
    if change == "terminate":
        issuer.status = EmploymentStatus.TERMINATED
    else:
        destination = await db_async.scalar(
            select(EmploymentRecord).where(EmploymentRecord.user_id == outsider.id)
        )
        issuer.department_id = destination.department_id
    await db_async.commit()
    assert await effective_roles(db_async, actor) == []
    assert await effective_roles(db_async, target) == []
    assert (await service.get_users(session=db_async, current_user=actor))[1] == 0
