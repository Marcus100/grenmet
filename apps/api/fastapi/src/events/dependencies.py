from dataclasses import dataclass
from typing import Annotated

from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials
from sqlalchemy.ext.asyncio import AsyncSession

from src.auth import service as auth_service
from src.auth.app_dependencies import OptionalBearer, app_user, optional_app_user
from src.auth.models import User
from src.auth.permissions import EVENTS_OPS_KEYS
from src.auth.privileged_mfa import require_privileged_mfa
from src.dependencies import CurrentUser, SessionDep, TokenDep
from src.organisations import service as organisations
from src.organisations.dependencies import (
    STAFF_MFA_KEYS,
    has_staff_access,
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


async def _require_superuser_mfa(
    session: AsyncSession, user: User, credentials: OptionalBearer
) -> None:
    """A superuser holds Events powers implicitly, so the staff MFA gate applies
    to them here (under ``AUTH_PRIVILEGED_MFA_MODE=enforce``); ordinary
    organisers and moderators are not privileged and are untouched."""
    if user.is_superuser:
        await require_privileged_mfa(
            session,
            user,
            token=credentials.credentials if credentials else None,
            app_key="events",
        )


async def require_organiser(
    user: EventsMember, session: SessionDep, credentials: OptionalBearer
) -> User:
    """Organiser access: the ``events.organiser.manage`` permission (legacy
    ``organiser_members`` rows) or an active admin/owner platform membership."""
    await _require_superuser_mfa(session, user, credentials)
    if await auth_service.has_effective_permission(
        session=session, user=user, permission_key="events.organiser.manage"
    ):
        return user
    if await organisations.list_managed_organisation_ids(session, user.id):
        return user
    raise EventsForbidden("Organiser access is required")


async def require_moderator(
    user: EventsMember, session: SessionDep, credentials: OptionalBearer
) -> User:
    await _require_superuser_mfa(session, user, credentials)
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


@dataclass(frozen=True)
class StaffAccess:
    """A Barrels staff caller and the ``events.ops.*`` keys held through roles."""

    user: User
    keys: frozenset[str]

    @property
    def sees_drafts(self) -> bool:
        """Draft titles are for staff who help with listings or settlement, not the
        door."""
        return bool(self.keys & {"events.ops.listings", "events.ops.settlement"})


async def require_events_staff(session: SessionDep, token: TokenDep) -> StaffAccess:
    """Barrels staff who hold some ``events.ops.*`` key through a role (ADR-0050).

    An account session or an Events app session, with the Events app
    (``app.events.access``). A superuser holds no key implicitly. Two-step
    verification is required unless the only key held is ``events.ops.door``
    (volunteers). 403 for anyone else."""
    user, token_app = await resolve_org_caller(
        session,
        HTTPAuthorizationCredentials(scheme="Bearer", credentials=token),
        "events",
    )
    held = frozenset(
        [key for key in EVENTS_OPS_KEYS if await has_staff_access(session, user, key)]
    )
    if not held:
        raise EventsForbidden("Events staff access is required")
    if held & STAFF_MFA_KEYS:
        await require_staff_session_mfa(session, user, token=token, token_app=token_app)
    return StaffAccess(user=user, keys=held)


EventsStaff = Annotated[StaffAccess, Depends(require_events_staff)]
