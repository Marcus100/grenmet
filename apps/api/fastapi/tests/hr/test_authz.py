import uuid
from datetime import date

import pytest
from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.auth.models import Permission, Role, RoleAssignmentScope, UserRoleAssignment
from src.auth.policy import can_act_on_user
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.exceptions import AuthorizationError
from src.hr.absentee.models import AbsenceReason
from src.hr.absentee.schemas import AbsenteeReportCreate
from src.hr.absentee.service import create_absentee_report
from src.hr.exceptions import HRPermissionDeniedError, WorkflowTemplateNotFoundError
from src.hr.models import Department, EmploymentRecord
from src.hr.parking.schemas import ParkingPermitCreate
from src.hr.parking.service import create_parking_permit
from src.hr.workflow.schemas import WorkflowInstanceCreate
from src.hr.workflow.service import create_workflow_instance
from tests.factories import (
    assign_role,
    make_department,
    make_role_with_permission,
    make_supervised_pair,
    make_user,
)
from tests.utils.utils import random_email, random_lower_string


async def test_department_scope_assignment_enforced(
    db_async: AsyncSession,
) -> None:
    supervisor = await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"sup_{random_lower_string()}",
            password="password123",
            first_name="Scope",
            last_name="Supervisor",
        ),
    )
    target = await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"user_{random_lower_string()}",
            password="password123",
            first_name="Scope",
            last_name="Target",
        ),
    )
    result = await db_async.execute(select(Role).where(Role.name == "SUPERVISOR"))
    role = result.scalars().first()
    if not role:
        role = Role(name="SUPERVISOR")
        db_async.add(role)
        await db_async.commit()
        await db_async.refresh(role)
    result = await db_async.execute(
        select(Permission).where(Permission.key == "timesheet.approve")
    )
    permission = result.scalars().first()
    if not permission:
        permission = Permission(
            key="timesheet.approve",
            action="update",
            entity="timesheet",
            access="department",
            description="Approve timesheet",
        )
    await db_async.refresh(role, attribute_names=["permissions"])
    role.permissions.append(permission)
    await db_async.refresh(supervisor, attribute_names=["roles"])
    supervisor.roles.append(role)
    db_async.add(role)
    db_async.add(permission)
    db_async.add(supervisor)

    if not await db_async.get(Department, "dept_scope_a"):
        db_async.add(Department(id="dept_scope_a", name="Dept Scope A"))
    if not await db_async.get(Department, "dept_scope_b"):
        db_async.add(Department(id="dept_scope_b", name="Dept Scope B"))
    await db_async.commit()

    db_async.add(
        EmploymentRecord(
            user_id=supervisor.id,
            employee_number=f"SUP-{random_lower_string()}",
            department_id="dept_scope_a",
            position="Supervisor",
        )
    )
    db_async.add(
        EmploymentRecord(
            user_id=target.id,
            employee_number=f"TGT-{random_lower_string()}",
            department_id="dept_scope_b",
            position="Officer",
        )
    )
    db_async.add(
        UserRoleAssignment(
            user_id=supervisor.id,
            role_id=role.id,
            scope=RoleAssignmentScope.DEPARTMENT,
            department_id="dept_scope_a",
        )
    )
    await db_async.commit()

    assert (
        await can_act_on_user(
            session=db_async,
            current_user=supervisor,
            target_user_id=target.id,
            permission_key="timesheet.approve",
        )
        is False
    )


# --------------------------------------------------------------------------- #
# Proxy-filing authorization: create_absentee_report / create_parking_permit
# must reject filing for an arbitrary user_id when the actor lacks dept-scoped
# authority over that user (the flat *.create permission is not enough).
# --------------------------------------------------------------------------- #


async def test_absentee_self_file_succeeds(db_async: AsyncSession) -> None:
    user = await make_user(db_async)
    dept = await make_department(db_async, "dept_abs_self")
    role, _ = await make_role_with_permission(db_async, "absentee.report.create")
    await assign_role(db_async, user=user, role=role)

    report = await create_absentee_report(
        session=db_async,
        current_user=user,
        payload=AbsenteeReportCreate(
            user_id=user.id,
            department_id=dept.id,
            report_date=date(2026, 7, 1),
            reason=AbsenceReason.TIME_OFF,
        ),
    )
    assert report.user_id == user.id


async def test_absentee_file_for_other_without_scope_denied(
    db_async: AsyncSession,
) -> None:
    actor = await make_user(db_async)
    other = await make_user(db_async)
    # SELF-scoped role: holds the create permission but no authority over others.
    role, _ = await make_role_with_permission(db_async, "absentee.report.create")
    await assign_role(db_async, user=actor, role=role)

    with pytest.raises(HRPermissionDeniedError):
        await create_absentee_report(
            session=db_async,
            current_user=actor,
            payload=AbsenteeReportCreate(
                user_id=other.id,
                department_id="dept_none",
                report_date=date(2026, 7, 1),
                reason=AbsenceReason.TIME_OFF,
            ),
        )


async def test_absentee_supervisor_proxy_file_succeeds(
    db_async: AsyncSession,
) -> None:
    supervisor, employee, dept, _ = await make_supervised_pair(
        db_async, "absentee.report.create"
    )

    report = await create_absentee_report(
        session=db_async,
        current_user=supervisor,
        payload=AbsenteeReportCreate(
            user_id=employee.id,
            department_id=dept.id,
            report_date=date(2026, 7, 1),
            reason=AbsenceReason.TIME_OFF,
        ),
    )
    assert report.user_id == employee.id
    assert report.submitted_by_user_id == supervisor.id


async def test_parking_file_for_other_without_scope_denied(
    db_async: AsyncSession,
) -> None:
    actor = await make_user(db_async)
    other = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "parking.permit.create")
    await assign_role(db_async, user=actor, role=role)

    with pytest.raises(HRPermissionDeniedError):
        await create_parking_permit(
            session=db_async,
            current_user=actor,
            payload=ParkingPermitCreate(
                user_id=other.id,
                department_id="dept_none",
                vehicle_registration_no="PCV-1234",
            ),
        )


async def test_parking_supervisor_proxy_file_succeeds(db_async: AsyncSession) -> None:
    supervisor, employee, dept, _ = await make_supervised_pair(
        db_async, "parking.permit.create"
    )

    permit = await create_parking_permit(
        session=db_async,
        current_user=supervisor,
        payload=ParkingPermitCreate(
            user_id=employee.id,
            department_id=dept.id,
            vehicle_registration_no="PCV-9999",
        ),
    )
    assert permit.user_id == employee.id


# --------------------------------------------------------------------------- #
# Workflow-instance creation via the public service path must be permission
# gated (previously any authenticated user could create an instance).
# --------------------------------------------------------------------------- #


async def test_workflow_instance_create_requires_permission(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)  # no workflow.instance.action

    with pytest.raises(AuthorizationError):
        await create_workflow_instance(
            session=db_async,
            current_user=user,
            instance_in=WorkflowInstanceCreate(
                workflow_template_id=uuid.uuid4(),
                entity_type="leave_request",
                entity_id=uuid.uuid4(),
            ),
        )


async def test_workflow_instance_create_permitted_passes_gate(
    db_async: AsyncSession,
) -> None:
    user = await make_user(db_async)
    role, _ = await make_role_with_permission(db_async, "workflow.instance.action")
    await assign_role(db_async, user=user, role=role)

    # Permission passes; the bogus template id then surfaces as a not-found,
    # proving the gate was cleared rather than blocking on authorization.
    with pytest.raises(WorkflowTemplateNotFoundError):
        await create_workflow_instance(
            session=db_async,
            current_user=user,
            instance_in=WorkflowInstanceCreate(
                workflow_template_id=uuid.uuid4(),
                entity_type="leave_request",
                entity_id=uuid.uuid4(),
            ),
        )
