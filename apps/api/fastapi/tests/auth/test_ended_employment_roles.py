"""#789: ending employment ends every role in that organisation, except the SELF-scope staff role."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.access import effective_roles
from src.auth.models import Role, RoleAssignmentScope, UserRoleAssignment
from src.auth.policy import STAFF_ROLE, _active_assignments
from src.exceptions import AppException
from src.hr import service
from src.hr.models import EmploymentRecord, EmploymentStatus, Organisation
from src.hr.schemas import EmploymentUpdate
from tests.factories import (
    assign_role,
    make_department,
    make_employee,
    make_role_with_permission,
    make_user,
)


async def _live_ids(db: AsyncSession, user_id) -> set:
    return {a.id for a in await _active_assignments(session=db, user_id=user_id)}


@pytest.mark.parametrize(
    "ended", [EmploymentStatus.TERMINATED, EmploymentStatus.INACTIVE]
)
async def test_custom_role_stops_granting_when_employment_ends(
    db_async: AsyncSession, ended: EmploymentStatus
) -> None:
    department = await make_department(db_async, "ended_roles_dept")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "workflow.instance.action")
    grant = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )
    assert grant.id in await _live_ids(db_async, user.id)

    record.status = ended
    await db_async.commit()

    assert grant.id not in await _live_ids(db_async, user.id)


@pytest.mark.parametrize(
    "ended", [EmploymentStatus.TERMINATED, EmploymentStatus.INACTIVE]
)
@pytest.mark.parametrize("key", ["timesheet.approve", "cap.alert.approve"])
async def test_self_scope_approver_role_stops_when_employment_ends(
    db_async: AsyncSession, key: str, ended: EmploymentStatus
) -> None:
    department = await make_department(db_async, "ended_roles_dept2")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, key)
    own = await assign_role(db_async, user=user, role=role)
    assert own.id in await _live_ids(db_async, user.id)
    assert role.id in {r.id for r in await effective_roles(db_async, user)}
    record.status = ended
    await db_async.commit()
    assert own.id not in await _live_ids(db_async, user.id)
    assert role.id not in {r.id for r in await effective_roles(db_async, user)}


async def test_baseline_staff_role_survives_ended_employment(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "ended_roles_dept2b")
    admin = await make_user(db_async, superuser=True)
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role = await db_async.scalar(select(Role).where(Role.name == STAFF_ROLE))
    if role is None:
        role, _ = await make_role_with_permission(
            db_async, "leave.request.create", role_name=STAFF_ROLE
        )
    own = await assign_role(db_async, user=user, role=role)
    await service.update_employment_for_user(
        session=db_async,
        current_user=admin,
        target_user_id=user.id,
        employment_update=EmploymentUpdate(status=EmploymentStatus.TERMINATED),
        approval_update=None,
    )
    await db_async.refresh(own)
    assert own.effective_to is None
    assert own.id in await _live_ids(db_async, user.id)


async def test_end_employment_service_expires_assignments_with_audit(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "ended_roles_dept3")
    admin = await make_user(db_async, superuser=True)
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    grant = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )

    await service.update_employment_for_user(
        session=db_async,
        current_user=admin,
        target_user_id=user.id,
        employment_update=EmploymentUpdate(status=EmploymentStatus.TERMINATED),
        approval_update=None,
    )

    row = await db_async.scalar(
        select(UserRoleAssignment).where(UserRoleAssignment.id == grant.id)
    )
    assert row is not None
    await db_async.refresh(row)
    assert row.effective_to is not None
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


async def test_nobody_edits_their_own_employment_status(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "ended_roles_dept4")
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "hr.employment.manage")
    grant = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )
    with pytest.raises(AppException) as raised:
        await service.update_employment_for_user(
            session=db_async,
            current_user=user,
            target_user_id=user.id,
            employment_update=EmploymentUpdate(status=EmploymentStatus.TERMINATED),
            approval_update=None,
        )
    assert raised.value.status_code == 400
    record = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == user.id)
    )
    assert record is not None
    await db_async.refresh(record)
    assert record.status == EmploymentStatus.ACTIVE
    await db_async.refresh(grant)
    assert grant.effective_to is None

    # Sending the unchanged status with another field is an ordinary edit.
    await service.update_employment_for_user(
        session=db_async,
        current_user=user,
        target_user_id=user.id,
        employment_update=EmploymentUpdate(
            status=EmploymentStatus.ACTIVE, position="Senior Officer"
        ),
        approval_update=None,
    )
    await db_async.refresh(record)
    assert record.position == "Senior Officer"


async def test_old_plain_role_link_ends_with_employment(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "ended_roles_dept5")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    user.roles.append(role)
    db_async.add(user)
    await db_async.commit()
    assert role.id in {r.id for r in await effective_roles(db_async, user)}

    record.status = EmploymentStatus.TERMINATED
    await db_async.commit()
    assert role.id not in {r.id for r in await effective_roles(db_async, user)}


async def _staff_role(db: AsyncSession) -> Role:
    role = await db.scalar(select(Role).where(Role.name == STAFF_ROLE))
    if role is None:
        role, _ = await make_role_with_permission(
            db, "leave.request.create", role_name=STAFF_ROLE
        )
    return role


async def test_department_scope_staff_role_is_not_exempt(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "ended_roles_dept6")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    grant = await assign_role(
        db_async,
        user=user,
        role=await _staff_role(db_async),
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=department.id,
    )
    record.status = EmploymentStatus.TERMINATED
    await db_async.commit()
    assert grant.id not in await _live_ids(db_async, user.id)


async def test_holder_with_no_employment_record_keeps_self_role(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    own = await assign_role(db_async, user=user, role=role)
    assert own.id in await _live_ids(db_async, user.id)


async def test_ending_in_one_organisation_leaves_another_organisation_alone(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "ended_roles_dept7")
    other = await db_async.get(Organisation, "ended_roles_org")
    if other is None:
        db_async.add(
            Organisation(id="ended_roles_org", code="ENDEDROLES", name="Other employer")
        )
        await db_async.commit()
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    here = await assign_role(db_async, user=user, role=role)
    elsewhere = await assign_role(
        db_async, user=user, role=role, organisation_id="ended_roles_org"
    )
    record.status = EmploymentStatus.TERMINATED
    await db_async.commit()
    live = await _live_ids(db_async, user.id)
    assert here.id not in live
    assert elsewhere.id in live


async def _hr_admin(db: AsyncSession, scope: RoleAssignmentScope, department_id: str):
    admin = await make_user(db)
    await make_employee(db, user=admin, department_id=department_id)
    role, _ = await make_role_with_permission(db, "hr.employment.manage")
    await assign_role(
        db,
        user=admin,
        role=role,
        scope=scope,
        department_id=department_id
        if scope == RoleAssignmentScope.DEPARTMENT
        else None,
    )
    return admin


async def _end(db: AsyncSession, actor, user, status: EmploymentStatus) -> None:
    await service.update_employment_for_user(
        session=db,
        current_user=actor,
        target_user_id=user.id,
        employment_update=EmploymentUpdate(status=status),
        approval_update=None,
    )


async def test_department_hr_admin_pauses_but_does_not_end_organisation_wide_roles(
    db_async: AsyncSession,
) -> None:
    """#794: a department-scope HR admin cannot permanently strip ALL-scope grants."""
    department = await make_department(db_async, "ended_roles_dept8")
    admin = await _hr_admin(db_async, RoleAssignmentScope.DEPARTMENT, department.id)
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    wide = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )
    local = await assign_role(
        db_async,
        user=user,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=department.id,
    )

    await _end(db_async, admin, user, EmploymentStatus.TERMINATED)

    await db_async.refresh(wide)
    await db_async.refresh(local)
    assert wide.effective_to is None  # paused, not ended
    assert local.effective_to is not None
    live = await _live_ids(db_async, user.id)
    assert wide.id not in live and local.id not in live


async def test_organisation_wide_hr_admin_ends_organisation_wide_roles(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "ended_roles_dept9")
    admin = await _hr_admin(db_async, RoleAssignmentScope.ALL, department.id)
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    wide = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )

    await _end(db_async, admin, user, EmploymentStatus.INACTIVE)

    await db_async.refresh(wide)
    assert wide.effective_to is not None


async def test_inactive_to_terminated_ends_roles_granted_while_inactive(
    db_async: AsyncSession,
) -> None:
    """#796: the second step of ending employment still ends roles."""
    department = await make_department(db_async, "ended_roles_dept10")
    superuser = await make_user(db_async, superuser=True)
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    await _end(db_async, superuser, user, EmploymentStatus.INACTIVE)
    role, _ = await make_role_with_permission(db_async, "timesheet.approve")
    late = await assign_role(db_async, user=user, role=role)

    await _end(db_async, superuser, user, EmploymentStatus.TERMINATED)
    await _end(db_async, superuser, user, EmploymentStatus.ACTIVE)

    await db_async.refresh(late)
    assert late.effective_to is not None
    assert late.id not in await _live_ids(db_async, user.id)


async def test_reinstating_does_not_bring_ended_roles_back(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "ended_roles_dept11")
    superuser = await make_user(db_async, superuser=True)
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    grant = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )

    await _end(db_async, superuser, user, EmploymentStatus.TERMINATED)
    await _end(db_async, superuser, user, EmploymentStatus.ACTIVE)

    assert grant.id not in await _live_ids(db_async, user.id)


async def test_empty_employment_status_is_rejected(db_async: AsyncSession) -> None:
    """#796: an explicit null status is a 400, not a database error."""
    department = await make_department(db_async, "ended_roles_dept12")
    superuser = await make_user(db_async, superuser=True)
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)

    with pytest.raises(AppException) as raised:
        await service.update_employment_for_user(
            session=db_async,
            current_user=superuser,
            target_user_id=user.id,
            employment_update=EmploymentUpdate.model_validate({"status": None}),
            approval_update=None,
        )
    assert raised.value.status_code == 400
    await db_async.refresh(record)
    assert record.status == EmploymentStatus.ACTIVE


async def test_department_admin_reinstating_does_not_revive_paused_organisation_roles(
    db_async: AsyncSession,
) -> None:
    """A department HR admin pauses an ALL-scope role on ending; reinstating must not revive it."""
    department = await make_department(db_async, "ended_roles_dept13")
    admin = await _hr_admin(db_async, RoleAssignmentScope.DEPARTMENT, department.id)
    user = await make_user(db_async)
    await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "cap.alert.approve")
    wide = await assign_role(
        db_async, user=user, role=role, scope=RoleAssignmentScope.ALL
    )

    await _end(db_async, admin, user, EmploymentStatus.TERMINATED)
    await db_async.refresh(wide)
    assert wide.effective_to is None  # paused while employment is ended

    await _end(db_async, admin, user, EmploymentStatus.ACTIVE)

    await db_async.refresh(wide)
    assert wide.effective_to is not None  # ended on reinstatement
    assert wide.id not in await _live_ids(db_async, user.id)
