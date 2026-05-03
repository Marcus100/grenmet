from sqlalchemy.ext.asyncio import AsyncSession
from sqlmodel import select

from src.auth.models import Permission, Role, RoleAssignmentScope, UserRoleAssignment
from src.auth.policy import can_act_on_user
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.hr.models import Department, EmploymentRecord
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
