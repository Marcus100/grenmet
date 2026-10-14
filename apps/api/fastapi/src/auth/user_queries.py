"""Read-only user lookups."""

import uuid
from collections.abc import Collection

from sqlalchemy import false, func, select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import (
    RoleAssignmentScope,
    User,
)


async def get_user_by_email(*, session: AsyncSession, email: str) -> User | None:
    """Get user by email address."""
    statement = select(User).where(User.email == email)
    result = await session.execute(statement)
    return result.scalars().first()


async def get_user_by_id(*, session: AsyncSession, user_id: uuid.UUID) -> User | None:
    """Get user by ID."""
    statement = select(User).where(User.id == user_id)
    result = await session.execute(statement)
    return result.scalars().first()


async def get_users_by_ids(
    *, session: AsyncSession, user_ids: Collection[uuid.UUID]
) -> dict[uuid.UUID, User]:
    """Users keyed by id, for domains that store Barrels Login ids by value."""
    if not user_ids:
        return {}
    result = await session.execute(select(User).where(User.id.in_(set(user_ids))))
    return {user.id: user for user in result.scalars()}


async def get_users(
    *,
    session: AsyncSession,
    skip: int = 0,
    limit: int = 100,
    current_user: User | None = None,
) -> tuple[list[User], int]:
    """Get users with total count. Returns (list of users, total count)."""
    statement = select(User)
    if current_user is not None and not current_user.is_superuser:
        from src.auth.policy import _active_assignments
        from src.hr.models import EmploymentRecord

        role_ids = {
            r.id
            for r in current_user.roles
            if any(p.key == "user.manage" for p in r.permissions)
        }
        from sqlalchemy import and_, or_

        filters = [
            and_(
                EmploymentRecord.organisation_id == a.organisation_id,
                *(
                    [EmploymentRecord.department_id == a.department_id]
                    if a.scope == RoleAssignmentScope.DEPARTMENT
                    else []
                ),
            )
            for a in await _active_assignments(session=session, user_id=current_user.id)
            if a.role_id in role_ids
            and a.scope in {RoleAssignmentScope.ALL, RoleAssignmentScope.DEPARTMENT}
        ]
        statement = statement.where(
            User.is_superuser.is_(False),
            User.id.in_(
                select(EmploymentRecord.user_id).where(
                    or_(*filters) if filters else false()
                )
            ),
        )
    count_stmt = select(func.count()).select_from(statement.subquery())
    count_result = await session.execute(count_stmt)
    total = count_result.scalar() or 0
    list_stmt = statement.order_by(User.id).offset(skip).limit(limit)
    list_result = await session.execute(list_stmt)
    users = list(list_result.scalars().all())
    return users, total
