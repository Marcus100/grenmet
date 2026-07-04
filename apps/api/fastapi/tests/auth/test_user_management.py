"""Tests for delegated user management (user.manage) and role lifecycle."""

import pytest
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.auth.models import Permission, Role
from src.auth.schemas import (
    RoleCreate,
    RoleUpdate,
    UserCreate,
    UserRoleAssignmentCreate,
)
from src.auth.service import create_user
from src.dependencies import get_current_user_manager, is_user_manager
from tests.utils.utils import random_email, random_lower_string


async def _user(db_async: AsyncSession, *, superuser: bool = False):
    return await create_user(
        session=db_async,
        user_create=UserCreate(
            email=random_email(),
            username=f"um_{random_lower_string()}",
            password="password123",
            first_name="User",
            last_name="Mgmt",
            is_superuser=superuser,
        ),
    )


async def _grant_user_manage(db_async: AsyncSession, user) -> None:
    role = Role(name=f"UM_{random_lower_string().upper()}")
    role.permissions.append(
        Permission(
            key="user.manage",
            action="manage",
            entity="user",
            access="all",
            description="Manage user accounts",
        )
    )
    await db_async.refresh(user, attribute_names=["roles"])
    user.roles.append(role)
    db_async.add(role)
    db_async.add(user)
    await db_async.commit()
    await db_async.refresh(user, attribute_names=["roles"])
    for r in user.roles:
        await db_async.refresh(r, attribute_names=["permissions"])


async def test_user_manager_dependency_allows_permission_holder(
    db_async: AsyncSession,
) -> None:
    manager = await _user(db_async)
    await _grant_user_manage(db_async, manager)
    assert is_user_manager(manager) is True
    assert await get_current_user_manager(manager) is manager


async def test_user_manager_dependency_rejects_plain_user(
    db_async: AsyncSession,
) -> None:
    plain = await _user(db_async)
    await db_async.refresh(plain, attribute_names=["roles"])
    assert is_user_manager(plain) is False
    with pytest.raises(HTTPException) as exc_info:
        await get_current_user_manager(plain)
    assert exc_info.value.status_code == 403


async def test_user_manager_dependency_allows_superuser(
    db_async: AsyncSession,
) -> None:
    admin = await _user(db_async, superuser=True)
    await db_async.refresh(admin, attribute_names=["roles"])
    assert await get_current_user_manager(admin) is admin


async def test_role_update_and_delete_lifecycle(db_async: AsyncSession) -> None:
    role = await auth_service.create_role(
        session=db_async,
        role_in=RoleCreate(
            name=f"LIFE_{random_lower_string().upper()}", description="before"
        ),
    )

    updated = await auth_service.update_role(
        session=db_async, db_role=role, role_in=RoleUpdate(description="after")
    )
    assert updated.description == "after"

    assert (
        await auth_service.count_role_assignments_for_role(
            session=db_async, role_id=role.id
        )
        == 0
    )
    await auth_service.delete_role(session=db_async, db_role=role)
    assert await auth_service.get_role(session=db_async, role_id=role.id) is None


async def test_role_assignment_revoke(db_async: AsyncSession) -> None:
    user = await _user(db_async)
    role = await auth_service.create_role(
        session=db_async,
        role_in=RoleCreate(name=f"REV_{random_lower_string().upper()}"),
    )
    assignment = await auth_service.create_user_role_assignment(
        session=db_async,
        assignment_in=UserRoleAssignmentCreate(user_id=user.id, role_id=role.id),
    )
    assert (
        await auth_service.count_role_assignments_for_role(
            session=db_async, role_id=role.id
        )
        == 1
    )

    await auth_service.delete_user_role_assignment(
        session=db_async, db_assignment=assignment
    )
    assert (
        await auth_service.count_role_assignments_for_role(
            session=db_async, role_id=role.id
        )
        == 0
    )
    # Role is now unreferenced and deletable.
    await auth_service.delete_role(session=db_async, db_role=role)
    assert await auth_service.get_role(session=db_async, role_id=role.id) is None
