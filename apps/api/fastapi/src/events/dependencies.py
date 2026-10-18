from collections.abc import AsyncGenerator
from typing import Annotated

from fastapi import Depends, HTTPException
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.auth.app_dependencies import app_user, optional_app_user
from src.auth.models import User
from src.dependencies import SessionDep
from src.organisations import service as organisations

from . import database
from .exceptions import EventsForbidden

UNAVAILABLE = "Barrels Events is unavailable"


async def get_session() -> AsyncGenerator[AsyncSession]:
    session = database.create_session()
    if session is None:
        raise HTTPException(503, UNAVAILABLE)
    try:
        async with session:
            yield session
    except SQLAlchemyError, OSError, TimeoutError:
        raise HTTPException(503, UNAVAILABLE) from None


# Module-level so tests can override them by identity.
require_member = app_user("events")
optional_member = optional_app_user("events")

EventsSession = Annotated[AsyncSession, Depends(get_session)]
EventsMember = Annotated[User, Depends(require_member)]
EventsViewer = Annotated[User | None, Depends(optional_member)]


async def require_organiser(user: EventsMember, session: SessionDep) -> User:
    """Organiser access: the ``events.organiser.manage`` permission (legacy
    ``organiser_members`` rows) or an active admin/owner platform membership."""
    if await auth_service.has_effective_permission(
        session=session, user=user, permission_key="events.organiser.manage"
    ):
        return user
    if await organisations.list_managed_organisation_ids(session, user.id):
        return user
    raise EventsForbidden("Organiser access is required")


async def require_moderator(user: EventsMember, session: SessionDep) -> User:
    if not await auth_service.has_effective_permission(
        session=session, user=user, permission_key="events.moderate"
    ):
        raise EventsForbidden("Moderator access is required")
    return user


EventsOrganiser = Annotated[User, Depends(require_organiser)]


async def organiser_scope(user: EventsOrganiser, session: SessionDep) -> list[str]:
    """Platform organisations the organiser manages (admin/owner, active)."""
    return await organisations.list_managed_organisation_ids(session, user.id)


OrganiserScope = Annotated[list[str], Depends(organiser_scope)]
EventsModerator = Annotated[User, Depends(require_moderator)]
