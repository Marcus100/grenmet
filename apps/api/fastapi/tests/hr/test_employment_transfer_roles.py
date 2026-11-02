"""#797: a department transfer re-assigns everything in that organisation.

A transfer ends the person's live non-baseline roles in the organisation (the
baseline SELF-scope staff role stays) and an administrator re-grants at the
destination. A transfer of someone who holds live organisation-wide (ALL-scope)
roles needs organisation-wide HR employment authority (#794); otherwise it is
refused and nothing changes.
"""

from datetime import timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import Role, RoleAssignmentScope, User, UserRoleAssignment
from src.auth.policy import STAFF_ROLE, _active_assignments
from src.exceptions import AuthorizationError
from src.hr import service
from src.hr.models import Department, EmploymentRecord, EmploymentStatus, Organisation
from src.hr.schemas import EmploymentUpdate
from src.utils.datetime import utc_now
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)


async def _live_ids(db: AsyncSession, user_id) -> set:
    return {a.id for a in await _active_assignments(session=db, user_id=user_id)}


async def _staff_role(db: AsyncSession) -> Role:
    role = await db.scalar(select(Role).where(Role.name == STAFF_ROLE))
    if role is None:
        role, _ = await make_role_with_permission(
            db, "leave.request.create", role_name=STAFF_ROLE
        )
    return role


async def _two_departments(
    db: AsyncSession, prefix: str
) -> tuple[Department, Department]:
    origin = await make_department(db, f"{prefix}_from")
    destination = await make_department(db, f"{prefix}_to")
    return origin, destination


async def _hr_admin(
    db: AsyncSession, *, scope: RoleAssignmentScope, departments: list[Department]
) -> User:
    """An administrator with hr.employment.manage at the given scope and departments."""
    admin = await make_user(db)
    await make_employee(db, user=admin, department_id=departments[0].id)
    role, _ = await make_role_with_permission(db, "hr.employment.manage")
    for department in departments:
        await assign_role(
            db,
            user=admin,
            role=role,
            scope=scope,
            department_id=department.id
            if scope == RoleAssignmentScope.DEPARTMENT
            else None,
        )
    return admin


async def _transfer(
    db: AsyncSession, actor: User, user: User, destination: Department, **extra
):
    return await service.update_employment_for_user(
        session=db,
        current_user=actor,
        target_user_id=user.id,
        employment_update=EmploymentUpdate(department_id=destination.id, **extra),
        approval_update=None,
    )


async def test_superuser_transfer_ends_every_non_baseline_role_with_audit(
    db_async: AsyncSession,
) -> None:
    origin, destination = await _two_departments(db_async, "transfer_all")
    superuser = await make_user(db_async, superuser=True)
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=origin.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    wide = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )
    local = await assign_role(
        db_async,
        user=user,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=origin.id,
    )
    own = await assign_role(db_async, user=user, role=role)
    baseline = await assign_role(db_async, user=user, role=await _staff_role(db_async))

    await _transfer(db_async, superuser, user, destination)

    live = await _live_ids(db_async, user.id)
    assert {wide.id, local.id, own.id}.isdisjoint(live)
    assert baseline.id in live
    for grant in (wide, local, own):
        await db_async.refresh(grant)
        assert grant.effective_to is not None
        entries = (
            await db_async.scalars(
                select(AuditEntry).where(
                    AuditEntry.record_type == "role_assignment",
                    AuditEntry.record_id == str(grant.id),
                    AuditEntry.action == "UPDATE",
                )
            )
        ).all()
        assert entries
    record = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == user.id)
    )
    assert record is not None
    await db_async.refresh(record)
    assert record.department_id == destination.id


async def test_transfer_to_the_same_department_ends_nothing(
    db_async: AsyncSession,
) -> None:
    origin, _ = await _two_departments(db_async, "transfer_same")
    superuser = await make_user(db_async, superuser=True)
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=origin.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    wide = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )
    local = await assign_role(
        db_async,
        user=user,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=origin.id,
    )

    await service.update_employment_for_user(
        session=db_async,
        current_user=superuser,
        target_user_id=user.id,
        employment_update=EmploymentUpdate(
            department_id=origin.id, position="Senior Officer"
        ),
        approval_update=None,
    )

    live = await _live_ids(db_async, user.id)
    assert wide.id in live
    assert local.id in live


async def test_department_admin_cannot_transfer_someone_with_organisation_wide_roles(
    db_async: AsyncSession,
) -> None:
    """#794: refused with 403, and the record and its roles are unchanged."""
    origin, destination = await _two_departments(db_async, "transfer_refuse")
    admin = await _hr_admin(
        db_async,
        scope=RoleAssignmentScope.DEPARTMENT,
        departments=[origin, destination],
    )
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=origin.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    wide = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )
    local = await assign_role(
        db_async,
        user=user,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=origin.id,
    )

    with pytest.raises(AuthorizationError) as raised:
        await _transfer(db_async, admin, user, destination)

    assert raised.value.status_code == 403
    assert "organisation-wide" in raised.value.message
    await db_async.refresh(record)
    assert record.department_id == origin.id
    live = await _live_ids(db_async, user.id)
    assert wide.id in live
    assert local.id in live


async def test_refused_transfer_also_leaves_a_status_change_unapplied(
    db_async: AsyncSession,
) -> None:
    origin, destination = await _two_departments(db_async, "transfer_refuse2")
    admin = await _hr_admin(
        db_async,
        scope=RoleAssignmentScope.DEPARTMENT,
        departments=[origin, destination],
    )
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=origin.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    await assign_role(db_async, user=user, role=role, scope=RoleAssignmentScope.ALL)

    with pytest.raises(AuthorizationError):
        await _transfer(
            db_async, admin, user, destination, status=EmploymentStatus.TERMINATED
        )

    await db_async.refresh(record)
    assert record.status == EmploymentStatus.ACTIVE
    assert record.department_id == origin.id


async def test_organisation_wide_hr_admin_may_transfer_someone_with_organisation_wide_roles(
    db_async: AsyncSession,
) -> None:
    origin, destination = await _two_departments(db_async, "transfer_org_admin")
    admin = await _hr_admin(
        db_async, scope=RoleAssignmentScope.ALL, departments=[origin]
    )
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=origin.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    wide = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )

    await _transfer(db_async, admin, user, destination)

    await db_async.refresh(wide)
    assert wide.effective_to is not None


async def test_department_admin_transfers_someone_without_organisation_wide_roles(
    db_async: AsyncSession,
) -> None:
    origin, destination = await _two_departments(db_async, "transfer_dept_ok")
    admin = await _hr_admin(
        db_async,
        scope=RoleAssignmentScope.DEPARTMENT,
        departments=[origin, destination],
    )
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=origin.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    local = await assign_role(
        db_async,
        user=user,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=origin.id,
    )
    own = await assign_role(db_async, user=user, role=role)
    baseline = await assign_role(db_async, user=user, role=await _staff_role(db_async))

    profile = await _transfer(db_async, admin, user, destination)

    live = await _live_ids(db_async, user.id)
    assert local.id not in live
    assert own.id not in live
    assert baseline.id in live
    assert profile.employment.department is not None
    assert profile.employment.department.id == destination.id


async def test_expired_organisation_wide_grant_does_not_block_a_department_transfer(
    db_async: AsyncSession,
) -> None:
    origin, destination = await _two_departments(db_async, "transfer_expired")
    admin = await _hr_admin(
        db_async,
        scope=RoleAssignmentScope.DEPARTMENT,
        departments=[origin, destination],
    )
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=origin.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    expired = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )
    expired.effective_to = utc_now() - timedelta(days=1)
    db_async.add(expired)
    await db_async.commit()

    await _transfer(db_async, admin, user, destination)

    await db_async.refresh(expired)
    assert expired.effective_to is not None


async def test_transfer_leaves_roles_in_another_organisation_alone(
    db_async: AsyncSession,
) -> None:
    origin, destination = await _two_departments(db_async, "transfer_other_org")
    superuser = await make_user(db_async, superuser=True)
    other = await db_async.get(Organisation, "transfer_other_org_org")
    if other is None:
        db_async.add(
            Organisation(
                id="transfer_other_org_org", code="TRANSFERORG", name="Other employer"
            )
        )
        await db_async.commit()
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=origin.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    elsewhere = await assign_role(
        db_async,
        user=user,
        role=role,
        scope=RoleAssignmentScope.ALL,
        organisation_id="transfer_other_org_org",
    )

    await _transfer(db_async, superuser, user, destination)

    assert elsewhere.id in await _live_ids(db_async, user.id)
    persisted = await db_async.scalar(
        select(UserRoleAssignment).where(UserRoleAssignment.id == elsewhere.id)
    )
    assert persisted is not None
    await db_async.refresh(persisted)
    assert persisted.effective_to is None


async def test_department_admin_transfer_with_no_roles_only_moves_the_record(
    db_async: AsyncSession,
) -> None:
    origin, destination = await _two_departments(db_async, "transfer_bare")
    admin = await _hr_admin(
        db_async,
        scope=RoleAssignmentScope.DEPARTMENT,
        departments=[origin, destination],
    )
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=origin.id)

    profile = await _transfer(db_async, admin, user, destination)

    assert profile.employment.department is not None
    assert profile.employment.department.id == destination.id
    assert await _live_ids(db_async, user.id) == set()
