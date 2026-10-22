from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.auth.app_dependencies import app_user, optional_app_user
from src.auth.models import User
from src.auth.permissions import EVENTS_OPS_KEYS
from src.auth.policy import has_role_permission
from src.dependencies import CurrentUser, SessionDep, TokenDep
from src.organisations import service as organisations
from src.organisations.dependencies import (
    STAFF_MFA_KEYS,
    require_staff_session_mfa,
    resolve_org_caller,
)

from .exceptions import EventsForbidden


async def get_session(session: SessionDep) -> AsyncSession:
    """The request's main-database session (Events lives in the ``events`` schema).

    A separate dependency so tests can override it by identity; FastAPI caches
    ``SessionDep`` per request, so this is the same session as ``SessionDep``."""
    return session


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


async def require_moderation_reader(user: CurrentUser, session: SessionDep) -> User:
    """Staff session (not an Events app token) of a superuser or an
    ``events.moderate`` holder: may read the admin verification queue."""
    if user.is_superuser or await auth_service.has_effective_permission(
        session=session, user=user, permission_key="events.moderate"
    ):
        return user
    raise EventsForbidden("Moderator access is required")


ModerationReader = Annotated[User, Depends(require_moderation_reader)]


async def require_events_staff(session: SessionDep, token: TokenDep) -> User:
    """Barrels staff who hold some ``events.ops.*`` key through a role (ADR-0050).

    An account session or an Events app session. A superuser holds no key
    implicitly. Two-step verification is required unless the only key held is
    ``events.ops.door`` (volunteers). 403 for anyone else."""
    user, token_app = await resolve_org_caller(
        session,
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
        "events",
    )
    held = {
        key
        for key in EVENTS_OPS_KEYS
        if await has_role_permission(session=session, user=user, permission_key=key)
    }
    if not held:
        raise EventsForbidden("Events staff access is required")
    if held & STAFF_MFA_KEYS:
        await require_staff_session_mfa(session, user, token=token, token_app=token_app)
    return user


EventsStaff = Annotated[User, Depends(require_events_staff)]
