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


async def make_user(
    session: AsyncSession,
    *,
    superuser: bool = False,
    email: str | None = None,
    password: str = "password123",
) -> User:
    """Create a user with random credentials."""
    return await create_user(
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
