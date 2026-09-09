"""Test factories — reduce boilerplate in test setup.

Usage:
    async def test_something(db_async):
        user = await make_user(db_async)
        role, perm = await make_role_with_permission(db_async, "leave.request.action")
        dept = await make_department(db_async, "dept_a")
        emp = await make_employee(db_async, user=user, department_id="dept_a")
        await assign_role(db_async, user=user, role=role, scope=RoleAssignmentScope.DEPARTMENT, department_id="dept_a")
"""

import uuid

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlmodel import select

from src.auth.models import (
    Permission,
    Role,
    RoleAssignmentScope,
    User,
    UserRoleAssignment,
)
from src.auth.schemas import UserCreate
from src.auth.service import create_user
from src.hr.models import Department, EmploymentRecord
from tests.utils.utils import random_email, random_lower_string


async def _load_user_with_roles(session: AsyncSession, user_id: uuid.UUID) -> User:
    """Re-fetch a user with roles+permissions eager-loaded.

    Mirrors ``src/dependencies.py:get_current_user`` so permission checks
    (``has_permission``) don't trigger a lazy-load under the async engine,
    which raises ``MissingGreenlet``.
    """
    result = await session.execute(
        select(User)
        .where(User.id == user_id)
        .options(selectinload(User.roles).selectinload(Role.permissions))
    )
    user = result.scalars().unique().one()
    return user


async def make_user(
    session: AsyncSession,
    *,
    superuser: bool = False,
    email: str | None = None,
    password: str = "password123",
) -> User:
    """Create a user with random credentials (roles+permissions eager-loaded)."""
    user = await create_user(
        session=session,
        user_create=UserCreate(
            email=email or random_email(),
            username=f"u_{random_lower_string()}",
            password=password,
            first_name="Test",
            last_name="User",
            is_superuser=superuser,
        ),
    )
    return await _load_user_with_roles(session, user.id)


async def make_permission(session: AsyncSession, key: str) -> Permission:
    """Find or create a permission by key."""
    result = await session.execute(select(Permission).where(Permission.key == key))
    perm = result.scalars().first()
    if perm:
        return perm
    parts = key.split(".")
    perm = Permission(
        key=key,
        action=parts[1] if len(parts) > 1 else "action",
        entity=parts[0],
        access=parts[2] if len(parts) > 2 else "any",
        description=f"Auto-created: {key}",
    )
    session.add(perm)
    await session.commit()
    await session.refresh(perm)
    return perm


async def make_role_with_permission(
    session: AsyncSession,
    *permission_keys: str,
    role_name: str | None = None,
) -> tuple[Role, list[Permission]]:
    """Create a role and attach the given permissions to it."""
    name = role_name or f"ROLE_{uuid.uuid4().hex[:8].upper()}"
    role = Role(name=name)
    session.add(role)
    await session.flush()

    perms: list[Permission] = []
    for key in permission_keys:
        perm = await make_permission(session, key)
        await session.refresh(role, attribute_names=["permissions"])
        if perm not in role.permissions:
            role.permissions.append(perm)
        perms.append(perm)

    session.add(role)
    await session.commit()
    await session.refresh(role)
    return role, perms


async def make_department(
    session: AsyncSession, department_id: str | None = None
) -> Department:
    """Find or create a department."""
    dept_id = department_id or f"dept_{uuid.uuid4().hex[:8]}"
    existing = await session.get(Department, dept_id)
    if existing:
        return existing
    dept = Department(id=dept_id, name=f"Dept {dept_id}")
    session.add(dept)
    await session.commit()
    await session.refresh(dept)
    return dept


async def make_employee(
    session: AsyncSession,
    *,
    user: User,
    department_id: str,
    position: str = "Officer",
) -> EmploymentRecord:
    """Create an employment record linking a user to a department."""
    record = EmploymentRecord(
        user_id=user.id,
        employee_number=f"EMP-{random_lower_string()[:8].upper()}",
        department_id=department_id,
        position=position,
    )
    session.add(record)
    await session.commit()
    await session.refresh(record)
    return record


async def assign_role(
    session: AsyncSession,
    *,
    user: User,
    role: Role,
    scope: RoleAssignmentScope = RoleAssignmentScope.SELF,
    department_id: str | None = None,
) -> UserRoleAssignment:
    """Assign a role to a user and load it onto user.roles."""
    assignment = UserRoleAssignment(
        user_id=user.id,
        role_id=role.id,
        scope=scope,
        department_id=department_id,
    )
    session.add(assignment)
    await session.refresh(user, attribute_names=["roles"])
    if role not in user.roles:
        user.roles.append(role)
    session.add(user)
    await session.commit()
    await session.refresh(user, attribute_names=["roles"])
    # Eager-load each role's permissions so has_permission() doesn't lazy-load.
    for assigned_role in user.roles:
        await session.refresh(assigned_role, attribute_names=["permissions"])
    return assignment


async def make_supervised_pair(
    session: AsyncSession,
    *permission_keys: str,
    department_id: str | None = None,
) -> tuple[User, User, Department, Role]:
    """Create a supervisor + employee in the same department with the given permissions.

    Returns (supervisor, employee, department, role).
    The supervisor has the role with all given permissions, scoped to the department.
    The employee has an employment record in the same department.
    """
    dept = await make_department(session, department_id)
    supervisor = await make_user(session)
    employee = await make_user(session)

    role, _ = await make_role_with_permission(session, *permission_keys)

    await make_employee(
        session, user=supervisor, department_id=dept.id, position="Supervisor"
    )
    await make_employee(
        session, user=employee, department_id=dept.id, position="Officer"
    )

    await assign_role(
        session,
        user=supervisor,
        role=role,
        scope=RoleAssignmentScope.DEPARTMENT,
        department_id=dept.id,
    )

    return supervisor, employee, dept, role


async def make_ready_staff(
    session: AsyncSession, user: User, department_id: str
) -> None:
    """Explicit complete personnel and opening balances for workflow success tests."""
    from datetime import date
    from decimal import Decimal

    from src.baseline.models import ApprovalPolicy, StaffCredential
    from src.hr.leave.models import LeaveBalanceEvent, LeaveType
    from src.hr.models import EmploymentType, Grade
    from src.hr.workflow.models import WorkflowType

    grade_id = f"{department_id}_TEST"
    if await session.get(Grade, grade_id) is None:
        session.add(
            Grade(
                id=grade_id,
                department_id=department_id,
                code="TEST",
                label="Test grade",
                rank=1,
            )
        )
        await session.flush()
    employment = (
        (
            await session.execute(
                select(EmploymentRecord).where(EmploymentRecord.user_id == user.id)
            )
        )
        .scalars()
        .first()
    )
    if employment is None:
        employment = EmploymentRecord(user_id=user.id, department_id=department_id)
    employment.grade_id = grade_id
    employment.employee_number = (
        employment.employee_number or f"TEST-{user.id.hex[:12]}"
    )
    employment.employment_type = EmploymentType.FULL_TIME
    employment.start_date = date(2020, 1, 1)
    session.add(employment)
    if await session.get(StaffCredential, user.id) is None:
        session.add(
            StaffCredential(
                user_id=user.id, department_id=department_id, grade_id=grade_id
            )
        )
    for kind in WorkflowType:
        key = f"hr:{department_id}:{kind.value}"
        if await session.get(ApprovalPolicy, key) is None:
            session.add(ApprovalPolicy(key=key))
    for kind in (LeaveType.VACATION, LeaveType.SICK):
        existing = (
            (
                await session.execute(
                    select(LeaveBalanceEvent).where(
                        LeaveBalanceEvent.user_id == user.id,
                        LeaveBalanceEvent.leave_type == kind.value,
                    )
                )
            )
            .scalars()
            .first()
        )
        if existing is None:
            session.add(
                LeaveBalanceEvent(
                    user_id=user.id,
                    leave_type=kind.value,
                    delta_days=Decimal("30"),
                    balance_after_days=Decimal("30"),
                    reason="Verified test opening balance",
                    created_by_user_id=user.id,
                )
            )
    await session.commit()


async def make_submission_setup(session, user, department_id, workflow_type):
    """Explicit reference data for tests that submit a new HR form."""
    from src.hr.workflow.models import WorkflowStepTemplate, WorkflowTemplate

    await make_ready_staff(session, user, department_id)
    role, _ = await make_role_with_permission(session, "workflow.instance.action")
    template = WorkflowTemplate(
        department_id=department_id,
        workflow_type=workflow_type,
        name="Test approval workflow",
    )
    session.add(template)
    await session.flush()
    session.add(
        WorkflowStepTemplate(
            workflow_template_id=template.id, step_order=1, required_role_id=role.id
        )
    )
    await session.commit()
