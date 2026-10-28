"""#789: ending employment ends every non-SELF role in that organisation."""

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.audit.models import AuditEntry
from src.auth.models import RoleAssignmentScope, UserRoleAssignment
from src.auth.policy import _active_assignments
from src.exceptions import AppException
from src.hr import service
from src.hr.models import EmploymentRecord, EmploymentStatus
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


async def test_self_scope_roles_are_untouched(
    db_async: AsyncSession,
) -> None:
    department = await make_department(db_async, "ended_roles_dept2")
    user = await make_user(db_async)
    record = await make_employee(db_async, user=user, department_id=department.id)
    role, _ = await make_role_with_permission(db_async, "workflow.instance.view")
    own = await assign_role(db_async, user=user, role=role)
    record.status = EmploymentStatus.TERMINATED
    await db_async.commit()
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
    await assign_role(db_async, user=user, role=role, scope=RoleAssignmentScope.ALL)
    with pytest.raises(AppException) as raised:
        await service.update_employment_for_user(
            session=db_async,
            current_user=user,
            target_user_id=user.id,
            employment_update=EmploymentUpdate(status=EmploymentStatus.ACTIVE),
            approval_update=None,
        )
    assert raised.value.status_code == 400
    record = await db_async.scalar(
        select(EmploymentRecord).where(EmploymentRecord.user_id == user.id)
    )
    assert record is not None
