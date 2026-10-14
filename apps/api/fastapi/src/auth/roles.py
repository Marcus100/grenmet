"""Roles and the permission catalogue."""

import uuid

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import (
    Permission,
    Role,
    User,
    UserRoleAssignment,
)
from src.auth.schemas import (
    PermissionCreate,
    PermissionUpdate,
    RoleCreate,
    RoleUpdate,
)


# Role management
async def create_role(*, session: AsyncSession, role_in: RoleCreate) -> Role:
    """Create a new role."""
    db_role = Role(**role_in.model_dump())
    session.add(db_role)
    await session.commit()
    await session.refresh(db_role)
    return db_role


async def get_role(*, session: AsyncSession, role_id: uuid.UUID) -> Role | None:
    """Get a role by ID."""
    statement = select(Role).where(Role.id == role_id)
    result = await session.execute(statement)
    return result.scalars().first()


async def get_roles_with_count(
    *,
    session: AsyncSession,
    skip: int = 0,
    limit: int = 100,
    current_user: User | None = None,
) -> tuple[list[Role], int]:
    """Get roles with total count. Returns (list of roles, total count)."""
    if current_user is not None and not current_user.is_superuser:
        from sqlalchemy.orm import selectinload

        from src.auth.delegation import DELEGATABLE_ROLES, ordinary_role

        choices = [
            r
            for r in (
                await session.scalars(
                    select(Role)
                    .where(Role.name.in_(DELEGATABLE_ROLES))
                    .options(selectinload(Role.permissions))
                )
            ).all()
            if ordinary_role(r)
        ]
        return choices[skip : skip + limit], len(choices)
    count_stmt = select(func.count()).select_from(Role)
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0
    list_stmt = select(Role).offset(skip).limit(limit)
    list_result = await session.execute(list_stmt)
    roles = list(list_result.scalars().all())
    return roles, total


async def update_role(
    *, session: AsyncSession, db_role: Role, role_in: RoleUpdate
) -> Role:
    """Update a role's name/description."""
    role_data = role_in.model_dump(exclude_unset=True)
    for key, value in role_data.items():
        setattr(db_role, key, value)
    session.add(db_role)
    await session.commit()
    await session.refresh(db_role)
    return db_role


async def count_role_assignments_for_role(
    *, session: AsyncSession, role_id: uuid.UUID
) -> int:
    """Count active user-role assignments referencing a role."""
    count_stmt = (
        select(func.count())
        .select_from(UserRoleAssignment)
        .where(UserRoleAssignment.role_id == role_id)
    )
    result = await session.execute(count_stmt)
    return result.scalar() or 0


async def delete_role(*, session: AsyncSession, db_role: Role) -> None:
    """Delete a role. Callers must ensure no assignments reference it."""
    # Clear the role_permission link rows explicitly — the FK has no cascade.
    await session.refresh(db_role, attribute_names=["permissions"])
    db_role.permissions.clear()
    session.add(db_role)
    await session.flush()
    await session.delete(db_role)
    await session.commit()


# Permission management
async def create_permission(
    *, session: AsyncSession, permission_in: PermissionCreate
) -> Permission:
    """Create a new permission."""
    permission_data = permission_in.model_dump()
    if not permission_data.get("key"):
        permission_data["key"] = (
            f"{permission_in.entity}.{permission_in.action}".strip().lower()
        )
    db_permission = Permission(**permission_data)
    session.add(db_permission)
    await session.commit()
    await session.refresh(db_permission)
    return db_permission


async def update_permission(
    *, session: AsyncSession, db_permission: Permission, permission_in: PermissionUpdate
) -> Permission:
    """Update a permission."""
    permission_data = permission_in.model_dump(exclude_unset=True)
    if "key" not in permission_data and (
        "entity" in permission_data or "action" in permission_data
    ):
        permission_data["key"] = (
            f"{permission_data.get('entity', db_permission.entity)}."
            f"{permission_data.get('action', db_permission.action)}"
        ).lower()
    for key, value in permission_data.items():
        setattr(db_permission, key, value)
    session.add(db_permission)
    await session.commit()
    await session.refresh(db_permission)
    return db_permission


async def get_permission(
    *, session: AsyncSession, permission_id: uuid.UUID
) -> Permission | None:
    """Get a permission by ID."""
    statement = select(Permission).where(Permission.id == permission_id)
    result = await session.execute(statement)
    return result.scalars().first()


async def get_permissions_with_count(
    *, session: AsyncSession, skip: int = 0, limit: int = 100
) -> tuple[list[Permission], int]:
    """Get permissions with total count. Returns (list of permissions, total count)."""
    count_stmt = select(func.count()).select_from(Permission)
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0
    list_stmt = select(Permission).offset(skip).limit(limit)
    list_result = await session.execute(list_stmt)
    permissions = list(list_result.scalars().all())
    return permissions, total
