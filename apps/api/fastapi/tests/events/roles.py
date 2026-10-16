"""Real auth-database users and roles for the organiser and moderator gates."""

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import Role, User
from src.auth.permissions import seed_permissions_and_roles_async
from tests.factories import assign_role, make_user


async def user_with_role(session: AsyncSession, role_name: str | None) -> User:
    """A main-database user holding ``role_name`` (None = no Events role)."""
    await seed_permissions_and_roles_async(session)
    user = await make_user(session)
    if role_name is not None:
        role = await session.scalar(select(Role).where(Role.name == role_name))
        assert role is not None, role_name
        await assign_role(session, user=user, role=role)
    return user
