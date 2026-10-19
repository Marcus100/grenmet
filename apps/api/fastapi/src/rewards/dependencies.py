from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth.models import User
from src.auth.policy import require_permission
from src.dependencies import CurrentUser
from src.events import database as events_database


async def optional_events_session() -> AsyncGenerator[AsyncSession | None]:
    """A read-only Events session, or ``None`` when Events has no database.

    Account pages degrade (no tickets, badges marked unavailable) rather than fail.
    Module-level so tests can override it by identity.
    """
    session = events_database.create_session()
    if session is None:
        yield None
        return
    async with session:
        yield session


OptionalEventsSession = Annotated[AsyncSession | None, Depends(optional_events_session)]


async def get_rewards_manager(current_user: CurrentUser) -> User:
    """Superusers and holders of ``rewards.manage``."""
    require_permission(current_user=current_user, permission_key="rewards.manage")
    return current_user


RewardsManager = Annotated[User, Depends(get_rewards_manager)]
